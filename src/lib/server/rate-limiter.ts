import { randomUUID } from 'node:crypto';
import type { Ratelimit } from '@upstash/ratelimit';
import type { Redis } from '@upstash/redis';
import {
	UPSTASH_REDIS_REST_URL,
	UPSTASH_REDIS_REST_TOKEN,
	MAX_CONCURRENT_EXTRACTIONS,
	GEMINI_TIMEOUT_MS,
} from '$lib/server/env';

type UpstashLimiter = { limit(key: string): Promise<{ success: boolean }> };

let upstashEnabled = false;
let RatelimitClass: typeof Ratelimit | null = null;
let redisClient: Redis | null = null;
const upstashLimiters = new Map<string, UpstashLimiter>();

if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
	try {
		const [{ Redis }, { Ratelimit }] = await Promise.all([
			import('@upstash/redis'),
			import('@upstash/ratelimit'),
		]);
		redisClient = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
		RatelimitClass = Ratelimit;
		upstashEnabled = true;
		redisClient.ping().catch((e: unknown) => console.error('[rate-limiter] Upstash ping failed:', e));
		console.info('[rate-limiter] Upstash Redis rate limiter enabled');
	} catch (e) {
		console.error('[rate-limiter] Failed to initialise Upstash — falling back to in-memory:', e);
	}
} else {
	console.warn(
		'[rate-limiter] UPSTASH_REDIS_REST_URL / _TOKEN not set — using in-memory rate limiter ' +
		'(single-instance only; not suitable for multi-replica deployments)',
	);
}

function getUpstashLimiter(max: number, windowSeconds: number): UpstashLimiter {
	const id = `${max}/${windowSeconds}`;
	if (!upstashLimiters.has(id)) {
		upstashLimiters.set(
			id,
			new RatelimitClass!({
				redis: redisClient!,
				limiter: RatelimitClass!.slidingWindow(max, `${windowSeconds} s`),
			}),
		);
	}
	return upstashLimiters.get(id)!;
}

interface Bucket { tokens: number; lastRefill: number; ttlMs: number }
const buckets = new Map<string, Bucket>();
const DEFAULT_WINDOW_SECONDS = 60;
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;

setInterval(() => {
	const now = Date.now();
	for (const [key, bucket] of buckets) {
		if (bucket.lastRefill < now - bucket.ttlMs) buckets.delete(key);
	}
}, SWEEP_INTERVAL_MS).unref();

function checkInMemory(key: string, max: number, windowSeconds: number): boolean {
	const now = Date.now();
	const windowMs = windowSeconds * 1000;
	const refillIntervalMs = windowMs / max;
	const ttlMs = Math.max(SWEEP_INTERVAL_MS, windowMs);
	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = { tokens: max - 1, lastRefill: now, ttlMs };
		buckets.set(key, bucket);
		return true;
	}
	const newTokens = Math.floor((now - bucket.lastRefill) / refillIntervalMs);
	if (newTokens > 0) {
		bucket.tokens = Math.min(max, bucket.tokens + newTokens);
		bucket.lastRefill = now;
	}
	if (bucket.tokens <= 0) return false;
	bucket.tokens--;
	return true;
}

export async function checkRateLimit(
	key: string,
	max: number,
	windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): Promise<boolean> {
	if (upstashEnabled) {
		try {
			const limiter = getUpstashLimiter(max, windowSeconds);
			const { success } = await limiter.limit(key);
			return success;
		} catch (e) {
			console.error('[rate-limiter] Upstash error, falling back to in-memory:', e);
		}
	}
	return checkInMemory(key, max, windowSeconds);
}

let activeExtractions = 0;
const extractionWaiters: Array<() => void> = [];

export function tryAcquireExtraction(max: number): boolean {
	if (activeExtractions >= max) return false;
	activeExtractions++;
	return true;
}

export function releaseExtraction(): void {
	const next = extractionWaiters.shift();
	if (next) {
		next();
		return;
	}
	activeExtractions = Math.max(0, activeExtractions - 1);
}

function acquireExtractionInMemory(max: number): Promise<void> {
	if (activeExtractions < max) {
		activeExtractions++;
		return Promise.resolve();
	}
	return new Promise((resolve) => extractionWaiters.push(resolve));
}

const SLOT_KEY = 'mep:extract:slots';
const SLOT_LEASE_MS = Math.max(GEMINI_TIMEOUT_MS + 60_000, 120_000);
const SLOT_POLL_INTERVAL_MS = 250;
const SLOT_MAX_WAIT_MS = 5 * 60_000;

const ACQUIRE_SLOT_SCRIPT = `
local now = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local lease = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local count = redis.call('ZCARD', KEYS[1])
if count < max then
	redis.call('ZADD', KEYS[1], now + lease, ARGV[3])
	redis.call('PEXPIRE', KEYS[1], lease + 60000)
	return 1
end
return 0
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ExtractionSlot {
	release(): Promise<void>;
}

async function acquireExtractionSlotRedis(max: number): Promise<ExtractionSlot | null> {
	const token = `${process.pid}:${randomUUID()}`;
	const deadline = Date.now() + SLOT_MAX_WAIT_MS;
	for (;;) {
		const granted = await redisClient!.eval(
			ACQUIRE_SLOT_SCRIPT,
			[SLOT_KEY],
			[String(Date.now()), String(max), token, String(SLOT_LEASE_MS)],
		);
		if (Number(granted) === 1) {
			let released = false;
			return {
				async release() {
					if (released) return;
					released = true;
					try {
						await redisClient!.zrem(SLOT_KEY, token);
					} catch (e) {
						console.error('[rate-limiter] Failed to release extraction slot in Redis:', e);
					}
				},
			};
		}
		if (Date.now() > deadline) {
			console.warn(
				`[rate-limiter] Timed out waiting ${SLOT_MAX_WAIT_MS}ms for an extraction slot ` +
				`(max ${max}) — proceeding without a Redis slot to avoid stalling the job`,
			);
			return { async release() { } };
		}
		await sleep(SLOT_POLL_INTERVAL_MS + Math.floor(Math.random() * SLOT_POLL_INTERVAL_MS));
	}
}

export async function acquireExtractionSlot(
	max: number = MAX_CONCURRENT_EXTRACTIONS,
): Promise<ExtractionSlot> {
	const cap = Math.max(1, max);
	if (upstashEnabled && redisClient) {
		try {
			const slot = await acquireExtractionSlotRedis(cap);
			if (slot) return slot;
		} catch (e) {
			console.error('[rate-limiter] Redis extraction semaphore error, falling back to in-memory:', e);
		}
	}
	await acquireExtractionInMemory(cap);
	let released = false;
	return {
		async release() {
			if (released) return;
			released = true;
			releaseExtraction();
		},
	};
}
