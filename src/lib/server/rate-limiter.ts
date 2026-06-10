// Rate limiter — uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// are set (distributed / multi-instance safe), otherwise falls back to an in-process token
// bucket (single-server only — documented constraint).

import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from '$lib/server/env';

// ── Upstash path ─────────────────────────────────────────────────────────────

type UpstashLimiter = { limit(key: string): Promise<{ success: boolean }> };

let upstashEnabled = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RatelimitClass: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;
const upstashLimiters = new Map<number, UpstashLimiter>();

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

function getUpstashLimiter(maxPerMinute: number): UpstashLimiter {
	if (!upstashLimiters.has(maxPerMinute)) {
		upstashLimiters.set(
			maxPerMinute,
			new RatelimitClass({ redis: redisClient, limiter: RatelimitClass.slidingWindow(maxPerMinute, '60 s') }),
		);
	}
	return upstashLimiters.get(maxPerMinute)!;
}

// ── In-memory fallback ────────────────────────────────────────────────────────

interface Bucket { tokens: number; lastRefill: number }
const buckets = new Map<string, Bucket>();
const BUCKET_TTL_MS = 2 * 60 * 1000;

setInterval(() => {
	const cutoff = Date.now() - BUCKET_TTL_MS;
	for (const [key, bucket] of buckets) {
		if (bucket.lastRefill < cutoff) buckets.delete(key);
	}
}, BUCKET_TTL_MS).unref();

function checkInMemory(key: string, maxPerMinute: number): boolean {
	const now = Date.now();
	const refillIntervalMs = 60_000 / maxPerMinute;
	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = { tokens: maxPerMinute - 1, lastRefill: now };
		buckets.set(key, bucket);
		return true;
	}
	const newTokens = Math.floor((now - bucket.lastRefill) / refillIntervalMs);
	if (newTokens > 0) {
		bucket.tokens = Math.min(maxPerMinute, bucket.tokens + newTokens);
		bucket.lastRefill = now;
	}
	if (bucket.tokens <= 0) return false;
	bucket.tokens--;
	return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkRateLimit(key: string, maxPerMinute: number): Promise<boolean> {
	if (upstashEnabled) {
		try {
			const limiter = getUpstashLimiter(maxPerMinute);
			const { success } = await limiter.limit(key);
			return success;
		} catch (e) {
			console.error('[rate-limiter] Upstash error, falling back to in-memory:', e);
		}
	}
	return checkInMemory(key, maxPerMinute);
}

// ── Extraction concurrency semaphore ─────────────────────────────────────────

let activeExtractions = 0;

export function tryAcquireExtraction(max: number): boolean {
	if (activeExtractions >= max) return false;
	activeExtractions++;
	return true;
}

export function releaseExtraction(): void {
	activeExtractions = Math.max(0, activeExtractions - 1);
}
