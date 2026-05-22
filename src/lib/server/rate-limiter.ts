// Token bucket rate limiter — one bucket per key (e.g. IP address).
// Suitable for single-process / single-server deployments only.

interface Bucket {
	tokens: number;
	lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const BUCKET_TTL_MS = 2 * 60 * 1000;

// Sweep stale buckets every 2 minutes to prevent unbounded memory growth.
setInterval(() => {
	const cutoff = Date.now() - BUCKET_TTL_MS;
	for (const [key, bucket] of buckets) {
		if (bucket.lastRefill < cutoff) buckets.delete(key);
	}
}, BUCKET_TTL_MS).unref();

export function checkRateLimit(key: string, maxPerMinute: number): boolean {
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

// Semaphore for limiting concurrent Gemini extraction calls.
let activeExtractions = 0;

export function tryAcquireExtraction(max: number): boolean {
	if (activeExtractions >= max) return false;
	activeExtractions++;
	return true;
}

export function releaseExtraction(): void {
	activeExtractions = Math.max(0, activeExtractions - 1);
}
