import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from '$lib/server/env';

type UpstashLimiter = { limit(key: string): Promise<{ success: boolean }> };

let upstashEnabled = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RatelimitClass: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;
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
			new RatelimitClass({
				redis: redisClient,
				limiter: RatelimitClass.slidingWindow(max, `${windowSeconds} s`),
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

export function tryAcquireExtraction(max: number): boolean {
	if (activeExtractions >= max) return false;
	activeExtractions++;
	return true;
}

export function releaseExtraction(): void {
	activeExtractions = Math.max(0, activeExtractions - 1);
}
