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

export async function checkRateLimit(
	key: string,
	max: number,
	windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): Promise<boolean> {
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
