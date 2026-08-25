/**
 * The extraction retry policy (#482), and what #520 found missing from it.
 *
 * The policy is not "retry on failure" — it is a classification. Only the three
 * degradation classes (rate limited, unavailable, timed out) survive to a
 * redelivery; everything else fails the item on the first attempt and goes to
 * the dead-letter queue instead. Getting that backwards either burns a tenant's
 * monthly quota re-running a job that can never succeed, or gives up on a
 * transient 429 that would have worked a minute later.
 *
 * The original three tests drove one error class (429) and asserted markFailed.
 * They could not see the classification, the dead-letter routing, or the
 * monthly-slot release — the part that costs a tenant real quota. This drives
 * the table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translations } from '../src/lib/i18n';

const sentryMocks = vi.hoisted(() => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
}));
vi.mock('@sentry/sveltekit', () => sentryMocks);

const item = {
	id: 'item-1',
	fileKey: 'ns/a.pdf',
	displayName: 'a.pdf',
};

const batchMocks = vi.hoisted(() => ({
	getItem: vi.fn(),
	markExtracting: vi.fn(),
	markDone: vi.fn(),
	markFailed: vi.fn(),
}));
vi.mock('../src/lib/server/batch.js', () => batchMocks);

const billingMocks = vi.hoisted(() => ({
	getAccessState: vi.fn(),
}));
vi.mock('../src/lib/server/billing.js', () => billingMocks);

const quotaMocks = vi.hoisted(() => ({
	checkExtractionQuota: vi.fn(),
	claimMonthlyExtraction: vi.fn(),
	releaseMonthlyExtraction: vi.fn(),
	recordLlmUsage: vi.fn(),
}));
vi.mock('../src/lib/server/llm-quota.js', () => quotaMocks);

const extractMocks = vi.hoisted(() => ({
	extractWithProvider: vi.fn(),
	extractInvoice: vi.fn(),
}));
vi.mock('../src/lib/server/extract.js', () => extractMocks);

vi.mock('../src/lib/server/products.js', () => ({
	annotateLineItems: vi.fn(async (_supplier: string, items: unknown[]) => ({
		enriched: items,
		conversionNotes: [],
	})),
}));

vi.mock('../src/lib/server/rate-limiter.js', () => ({
	acquireExtractionSlot: vi.fn(async () => ({ release: vi.fn() })),
}));

const deadLetterMocks = vi.hoisted(() => ({ recordDeadLetter: vi.fn() }));
vi.mock('../src/lib/server/dead-letter.js', () => deadLetterMocks);

vi.mock('../src/lib/server/sessions.js', () => ({
	uploadsDir: () => '/tmp/uploads',
}));

vi.mock('../src/lib/server/storage.js', () => ({
	getStorage: () => ({ read: vi.fn() }),
}));

const { processExtractionJob } = await import('../src/lib/server/extraction-worker');

const rateLimited = Object.assign(new Error('rate limited'), { status: 429 });

beforeEach(() => {
	vi.clearAllMocks();
	batchMocks.getItem.mockResolvedValue(item);
	billingMocks.getAccessState.mockResolvedValue({ allowed: true, trialExpired: false });
	quotaMocks.checkExtractionQuota.mockResolvedValue({ allowed: true });
	quotaMocks.claimMonthlyExtraction.mockResolvedValue({ claimed: true, limit: 100 });
});

describe('processExtractionJob retry policy (#482)', () => {
	it('does not mark an item failed on a transient error while retries remain, then succeeds on redelivery', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider
			.mockRejectedValueOnce(rateLimited)
			.mockResolvedValueOnce({ invoice: { supplier_name: 'Acme', line_items: [] }, usage: {} });

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 0, retryLimit: 2 });
		expect(batchMocks.markFailed).not.toHaveBeenCalled();

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 1, retryLimit: 2 });
		expect(batchMocks.markFailed).not.toHaveBeenCalled();
		expect(batchMocks.markDone).toHaveBeenCalledTimes(1);
		expect(batchMocks.markExtracting).toHaveBeenCalledTimes(2);
	});

	it('marks the item failed once retries are exhausted', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockRejectedValue(rateLimited);

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 2, retryLimit: 2 });
		expect(batchMocks.markFailed).toHaveBeenCalledTimes(1);
	});

	it('skips a redelivery that lost the item (not queued/extracting) without touching quota', async () => {
		batchMocks.markExtracting.mockResolvedValue(false);

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 1, retryLimit: 2 });

		expect(billingMocks.getAccessState).not.toHaveBeenCalled();
		expect(quotaMocks.checkExtractionQuota).not.toHaveBeenCalled();
		expect(quotaMocks.claimMonthlyExtraction).not.toHaveBeenCalled();
	});
});

/**
 * Each row is an error the provider can throw, the class the worker must file
 * it under, and whether that class is transient enough to deserve a redelivery.
 */
const ERROR_CLASSES = [
	{ label: 'HTTP 429',            err: Object.assign(new Error('rate limited'), { status: 429 }),      key: 'extract.err.rateLimited', transient: true  },
	{ label: 'HTTP 503',            err: Object.assign(new Error('unavailable'),  { status: 503 }),      key: 'extract.err.unavailable', transient: true  },
	{ label: 'GEMINI_TIMEOUT',      err: Object.assign(new Error('slow'),         { code: 'GEMINI_TIMEOUT' }), key: 'extract.err.timeout', transient: true  },
	{ label: 'ETIMEDOUT',           err: Object.assign(new Error('slow'),         { code: 'ETIMEDOUT' }), key: 'extract.err.timeout',     transient: true  },
	{ label: 'AbortError',          err: Object.assign(new Error('aborted'),      { name: 'AbortError' }), key: 'extract.err.timeout',    transient: true  },
	{ label: 'invalid JSON',        err: new Error('LLM returned invalid JSON'),                          key: 'extract.err.notInvoice',  transient: false },
	{ label: 'an unclassed error',  err: new Error('boom'),                                               key: 'extract.err.generic',     transient: false },
] as const;

const job = { itemId: item.id, restaurantId: 'r1' };
const RETRIES_LEFT = { retryCount: 0, retryLimit: 2 };
const FINAL_ATTEMPT = { retryCount: 2, retryLimit: 2 };

async function runFailing(err: unknown, retryInfo: { retryCount: number; retryLimit: number } | undefined) {
	batchMocks.markExtracting.mockResolvedValue(true);
	extractMocks.extractWithProvider.mockRejectedValue(err);
	await processExtractionJob(job, undefined, retryInfo);
}

describe('processExtractionJob — which failures earn a redelivery (#520)', () => {
	it.each(ERROR_CLASSES.filter((c) => c.transient))(
		'$label survives an attempt that still has retries left',
		async ({ err }) => {
			await runFailing(err, RETRIES_LEFT);

			expect(batchMocks.markFailed).not.toHaveBeenCalled();
			expect(batchMocks.markDone).not.toHaveBeenCalled();
		}
	);

	it.each(ERROR_CLASSES.filter((c) => !c.transient))(
		'$label fails the item immediately even with retries left',
		async ({ err, key }) => {
			await runFailing(err, RETRIES_LEFT);

			expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, key);
		}
	);

	it.each(ERROR_CLASSES)('$label fails the item on the final attempt', async ({ err, key }) => {
		await runFailing(err, FINAL_ATTEMPT);

		expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, key);
	});

	it.each(ERROR_CLASSES)('$label treats a job with no retry info as final', async ({ err, key }) => {
		await runFailing(err, undefined);

		expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, key);
	});
});

describe('processExtractionJob — a failed attempt must not cost the tenant quota (#520)', () => {
	it.each(ERROR_CLASSES)('$label releases the monthly slot it claimed', async ({ err }) => {
		await runFailing(err, RETRIES_LEFT);

		expect(quotaMocks.claimMonthlyExtraction).toHaveBeenCalledTimes(1);
		expect(quotaMocks.releaseMonthlyExtraction).toHaveBeenCalledWith('r1');
	});

	it('releases the slot on every attempt of a retried job, not just the last', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockRejectedValue(ERROR_CLASSES[0].err);

		await processExtractionJob(job, undefined, { retryCount: 0, retryLimit: 2 });
		await processExtractionJob(job, undefined, { retryCount: 1, retryLimit: 2 });

		expect(quotaMocks.releaseMonthlyExtraction).toHaveBeenCalledTimes(2);
	});

	it('does not release a slot it never claimed', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractInvoice.mockRejectedValue(new Error('boom'));

		await processExtractionJob(job, vi.fn(), FINAL_ATTEMPT);

		expect(quotaMocks.claimMonthlyExtraction).not.toHaveBeenCalled();
		expect(quotaMocks.releaseMonthlyExtraction).not.toHaveBeenCalled();
	});
});

describe('processExtractionJob — dead-letter routing follows the same classification (#520)', () => {
	it.each(ERROR_CLASSES.filter((c) => c.transient))(
		'$label is a degradation, not a dead letter',
		async ({ err }) => {
			await runFailing(err, FINAL_ATTEMPT);

			expect(deadLetterMocks.recordDeadLetter).not.toHaveBeenCalled();
			expect(sentryMocks.captureException).toHaveBeenCalled();
		}
	);

	it.each(ERROR_CLASSES.filter((c) => !c.transient))(
		'$label goes to the dead-letter queue with its class',
		async ({ err, key }) => {
			await runFailing(err, RETRIES_LEFT);

			expect(deadLetterMocks.recordDeadLetter).toHaveBeenCalledWith(
				expect.objectContaining({ errorClass: key, restaurantId: 'r1', sourceId: item.id })
			);
		}
	);

	it('carries enough payload to replay the job', async () => {
		await runFailing(new Error('boom'), FINAL_ATTEMPT);

		const payload = deadLetterMocks.recordDeadLetter.mock.calls[0][0].payload;
		expect(payload).toMatchObject({ itemId: item.id, restaurantId: 'r1', fileKey: item.fileKey });
	});
});

describe('processExtractionJob — a job it cannot even start (#520)', () => {
	it('dead-letters a job carrying no item id without claiming anything', async () => {
		await processExtractionJob({ restaurantId: 'r1' }, undefined, RETRIES_LEFT);

		expect(deadLetterMocks.recordDeadLetter).toHaveBeenCalledWith(
			expect.objectContaining({ errorClass: 'corrupt.missingItemId' })
		);
		expect(batchMocks.markExtracting).not.toHaveBeenCalled();
		expect(quotaMocks.claimMonthlyExtraction).not.toHaveBeenCalled();
	});

	it('dead-letters a job whose item no longer exists', async () => {
		batchMocks.getItem.mockResolvedValue(null);

		await processExtractionJob(job, undefined, RETRIES_LEFT);

		expect(deadLetterMocks.recordDeadLetter).toHaveBeenCalledWith(
			expect.objectContaining({ errorClass: 'corrupt.itemNotFound', sourceId: item.id })
		);
		expect(batchMocks.markExtracting).not.toHaveBeenCalled();
	});
});

describe('every failure key the worker can write is copy the user can read (#520)', () => {
	const es = translations.es as Record<string, string>;
	const en = translations.en as Record<string, string>;

	const WRITTEN_KEYS = [
		...ERROR_CLASSES.map((c) => c.key),
		'extract.err.quotaExceeded',
		'extract.err.trialExpired',
		'extract.err.subscriptionInactive',
	];

	it.each([...new Set(WRITTEN_KEYS)])('%s resolves in both locales', (key) => {
		expect(es[key], `${key} missing from es — the batch page renders the raw key`).toBeTruthy();
		expect(en[key], `${key} missing from en`).toBeTruthy();
	});
});

describe('processExtractionJob — entitlement refusals never reach the provider (#520)', () => {
	it('fails the item when the subscription is inactive', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		billingMocks.getAccessState.mockResolvedValue({ allowed: false, trialExpired: false, status: 'canceled' });

		await processExtractionJob(job, undefined, RETRIES_LEFT);

		expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, 'extract.err.subscriptionInactive');
		expect(extractMocks.extractWithProvider).not.toHaveBeenCalled();
	});

	it('distinguishes an expired trial from a cancelled subscription', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		billingMocks.getAccessState.mockResolvedValue({ allowed: false, trialExpired: true, status: 'trialing' });

		await processExtractionJob(job, undefined, RETRIES_LEFT);

		expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, 'extract.err.trialExpired');
	});

	it('fails the item when the monthly plan quota is exhausted, without claiming a slot', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		quotaMocks.claimMonthlyExtraction.mockResolvedValue({ claimed: false, limit: 100 });

		await processExtractionJob(job, undefined, RETRIES_LEFT);

		expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, 'extract.err.quotaExceeded');
		expect(extractMocks.extractWithProvider).not.toHaveBeenCalled();
		expect(quotaMocks.releaseMonthlyExtraction).not.toHaveBeenCalled();
	});
});
