import { MAX_CONCURRENT_EXTRACTIONS } from '$lib/server/env';

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

export class ExtractionSlotUnavailableError extends Error {
	readonly code = 'EXTRACTION_SLOT_UNAVAILABLE';

	constructor(waitedMs: number, max: number) {
		super(`No extraction slot available after ${waitedMs}ms (max ${max} concurrent)`);
		this.name = 'ExtractionSlotUnavailableError';
	}
}

const SLOT_MAX_WAIT_MS = 5 * 60_000;

let activeExtractions = 0;

interface ExtractionWaiter {
	settled: boolean;
	timer: ReturnType<typeof setTimeout>;
	grant(): void;
}

const extractionWaiters: ExtractionWaiter[] = [];

export function tryAcquireExtraction(max: number): boolean {
	if (activeExtractions >= max) return false;
	activeExtractions++;
	return true;
}

export function releaseExtraction(): void {
	while (extractionWaiters.length > 0) {
		const next = extractionWaiters.shift()!;
		if (next.settled) continue;
		next.grant();
		return;
	}
	activeExtractions = Math.max(0, activeExtractions - 1);
}

export function getExtractionSemaphoreStatus(): { active: number; waiting: number } {
	return { active: activeExtractions, waiting: extractionWaiters.length };
}

function acquireExtractionInMemory(max: number): Promise<void> {
	if (activeExtractions < max) {
		activeExtractions++;
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		const waiter: ExtractionWaiter = {
			settled: false,
			timer: setTimeout(() => {
				if (waiter.settled) return;
				waiter.settled = true;
				const idx = extractionWaiters.indexOf(waiter);
				if (idx !== -1) extractionWaiters.splice(idx, 1);
				console.warn(
					`[rate-limiter] Timed out waiting ${SLOT_MAX_WAIT_MS}ms for an in-memory extraction slot ` +
					`(max ${max}) — returning the job to the queue`,
				);
				reject(new ExtractionSlotUnavailableError(SLOT_MAX_WAIT_MS, max));
			}, SLOT_MAX_WAIT_MS),
			grant() {
				if (waiter.settled) return;
				waiter.settled = true;
				clearTimeout(waiter.timer);
				resolve();
			},
		};
		extractionWaiters.push(waiter);
	});
}

export interface ExtractionSlot {
	release(): Promise<void>;
}

export async function acquireExtractionSlot(
	max: number = MAX_CONCURRENT_EXTRACTIONS,
): Promise<ExtractionSlot> {
	await acquireExtractionInMemory(Math.max(1, max));
	let released = false;
	return {
		async release() {
			if (released) return;
			released = true;
			releaseExtraction();
		},
	};
}
