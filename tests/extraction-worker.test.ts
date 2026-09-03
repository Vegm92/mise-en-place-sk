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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { translations } from '../src/lib/i18n-messages';
import { JsonShapeMismatchError } from '../src/lib/server/llm-json';

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
	getBatchItems: vi.fn(async () => []),
	addItems: vi.fn(async () => []),
	markQueued: vi.fn(async () => true),
	markExtracting: vi.fn(),
	markDone: vi.fn(),
	markFailed: vi.fn(),
	markDiscarded: vi.fn(async () => true),
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
	reserveMonthlyExtractions: vi.fn(),
	attributeReservation: vi.fn(),
	recordLlmUsage: vi.fn(),
}));
vi.mock('../src/lib/server/llm-quota.js', () => quotaMocks);

const extractMocks = vi.hoisted(() => ({
	extractWithProvider: vi.fn(),
	extractInvoice: vi.fn(),
}));
vi.mock('../src/lib/server/extract.js', () => extractMocks);

const partyMocks = vi.hoisted(() => ({
	ownPartyIdentity: vi.fn(async () => ({ taxId: null, names: [] }) as { taxId: string | null; names: Array<string | null> }),
}));
vi.mock('../src/lib/server/party.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/lib/server/party')>()),
	ownPartyIdentity: partyMocks.ownPartyIdentity,
}));

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
vi.mock('../src/lib/server/dead-letter.js', () => ({
	recordDeadLetter: deadLetterMocks.recordDeadLetter,
	deadLetterRefFromJob: (queue: string, job: { id?: string | null; data?: unknown; retryCount?: number | null; retryLimit?: number | null }) => {
		const data = (job.data ?? {}) as Record<string, unknown>;
		const retryCount = job.retryCount ?? 0;
		const retryLimit = job.retryLimit ?? 0;
		return {
			queue,
			jobId: job.id ?? null,
			restaurantId: typeof data.restaurantId === 'string' ? data.restaurantId : null,
			sourceId: typeof data.itemId === 'string' ? data.itemId : null,
			attempt: retryCount + 1,
			retriesLeft: Math.max(0, retryLimit - retryCount),
			payload: job.data,
		};
	},
	runWithDeadLetter: async <T,>(
		ref: { retriesLeft?: number; queue?: string; jobId?: string | null; attempt?: number },
		run: () => Promise<T>,
	): Promise<T> => {
		try {
			return await run();
		} catch (err) {
			if ((ref.retriesLeft ?? 0) > 0) throw err;
			await deadLetterMocks.recordDeadLetter({ ...ref, error: err });
			throw err;
		}
	},
}));

vi.mock('../src/lib/server/sessions.js', () => ({
	uploadsDir: () => '/tmp/uploads',
}));

vi.mock('../src/lib/server/storage.js', () => ({
	getStorage: () => ({ read: vi.fn(), save: vi.fn() }),
}));

const segmentationMocks = vi.hoisted(() => ({
	isSegmentableDocument: vi.fn(() => false),
	segmentDocument: vi.fn(),
	STRUCTURE_UNCLEAR_ERROR: 'extract.err.structureUnclear',
	COMPOSITE_QUOTA_ERROR: 'extract.err.quotaCompositeExceeded',
}));
vi.mock('../src/lib/server/document-segmentation.js', () => segmentationMocks);

const queueMocks = vi.hoisted(() => ({
	EXTRACTION_QUEUE: 'extract-invoice',
	enqueueExtraction: vi.fn().mockResolvedValue(true),
	enqueueWhatsAppNotify: vi.fn().mockResolvedValue(true),
}));
vi.mock('../src/lib/server/queue.js', () => queueMocks);

const { processExtractionJob, runExtractionJobForBoss } = await import('../src/lib/server/extraction-worker');

const rateLimited = Object.assign(new Error('rate limited'), { status: 429 });
vi.mock('../src/lib/server/locations.js', () => ({ isLocationLocked: vi.fn().mockResolvedValue(false) }));

beforeEach(() => {
	vi.clearAllMocks();
	batchMocks.getItem.mockResolvedValue(item);
	billingMocks.getAccessState.mockResolvedValue({ allowed: true, trialExpired: false });
	quotaMocks.checkExtractionQuota.mockResolvedValue({ allowed: true });
	quotaMocks.claimMonthlyExtraction.mockResolvedValue({ claimed: true, limit: 100 });
	quotaMocks.reserveMonthlyExtractions.mockResolvedValue({ reserved: true });
	quotaMocks.attributeReservation.mockResolvedValue(undefined);
	partyMocks.ownPartyIdentity.mockResolvedValue({ taxId: null, names: [] });
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
	{ label: 'JSON shape mismatch', err: new JsonShapeMismatchError('LLM response parsed as JSON but does not match the expected shape'), key: 'extract.err.malformedResult', transient: false },
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

		expect(quotaMocks.claimMonthlyExtraction).toHaveBeenCalledWith('r1', item.id);
		expect(quotaMocks.releaseMonthlyExtraction).toHaveBeenCalledWith('r1', item.id, expect.any(String));
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

/**
 * The worker is where extraction ends, and a WhatsApp sender has no other way
 * to learn the outcome. The hand-back goes through a pg-boss queue rather than
 * a direct call so this module never imports a WhatsApp client.
 */
describe('WhatsApp notification hand-off', () => {
	const whatsappItem = { ...item, source: 'whatsapp', sourceRef: '34600111222' };

	it('enqueues a notification once extraction succeeds', async () => {
		batchMocks.getItem.mockResolvedValue(whatsappItem);
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockResolvedValue({
			invoice: { supplier_name: 'Acme', line_items: [] }, usage: {},
		});

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 0, retryLimit: 2 });

		expect(queueMocks.enqueueWhatsAppNotify).toHaveBeenCalledWith(item.id, 'r1');
	});

	it('enqueues a notification once the failure is terminal', async () => {
		batchMocks.getItem.mockResolvedValue(whatsappItem);
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockRejectedValue(rateLimited);

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 2, retryLimit: 2 });

		expect(queueMocks.enqueueWhatsAppNotify).toHaveBeenCalledTimes(1);
	});

	it('stays quiet while a transient failure still has retries left', async () => {
		// Otherwise one bad minute at the Gemini API costs the sender three
		// identical "no he podido leerla" messages.
		batchMocks.getItem.mockResolvedValue(whatsappItem);
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockRejectedValue(rateLimited);

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 0, retryLimit: 2 });

		expect(queueMocks.enqueueWhatsAppNotify).not.toHaveBeenCalled();
	});

	it('does not notify for a web upload', async () => {
		batchMocks.getItem.mockResolvedValue({ ...item, source: 'web', sourceRef: null });
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockResolvedValue({
			invoice: { supplier_name: 'Acme', line_items: [] }, usage: {},
		});

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 0, retryLimit: 2 });

		expect(queueMocks.enqueueWhatsAppNotify).not.toHaveBeenCalled();
	});

	it('does not fail the extraction when the enqueue itself fails', async () => {
		// The invoice IS extracted; losing the courtesy message must not undo it.
		batchMocks.getItem.mockResolvedValue(whatsappItem);
		batchMocks.markExtracting.mockResolvedValue(true);
		queueMocks.enqueueWhatsAppNotify.mockRejectedValueOnce(new Error('boss is down'));
		extractMocks.extractWithProvider.mockResolvedValue({
			invoice: { supplier_name: 'Acme', line_items: [] }, usage: {},
		});

		await expect(
			processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 0, retryLimit: 2 }),
		).resolves.toBe('completed');
		expect(batchMocks.markDone).toHaveBeenCalledTimes(1);
	});
});

/**
 * `processExtractionJob` never throws for its own classified outcomes — it
 * never did, even before #520 — so a `boss.work` handler that redelivers by
 * catching a throw never redelivers a real extraction failure: the queue's
 * `retryLimit: 2` (queue.ts) was configured but unreachable. `worker.ts` now
 * runs the extraction queue with `perJobResults: true` and reports each job's
 * disposition through this adapter instead, so pg-boss's own retry/dead-letter
 * machinery drives off the classification #482 already computed.
 */
describe('runExtractionJobForBoss — the pg-boss redelivery pg-boss never got (#520)', () => {
	const pgBossJob = (retryCount: number, retryLimit: number) => ({
		id: 'pgboss-job-1',
		data: { itemId: item.id, restaurantId: 'r1' },
		retryCount,
		retryLimit,
	});

	it('reports "failed" for a transient error with retries left, so pg-boss redelivers just this job', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockRejectedValue(rateLimited);

		const result = await runExtractionJobForBoss(pgBossJob(0, 2));

		expect(result).toEqual({ id: 'pgboss-job-1', status: 'failed' });
		expect(batchMocks.markFailed).not.toHaveBeenCalled();
	});

	it('reports "completed" once retries are exhausted, so pg-boss does not redeliver again', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockRejectedValue(rateLimited);

		const result = await runExtractionJobForBoss(pgBossJob(2, 2));

		expect(result).toEqual({ id: 'pgboss-job-1', status: 'completed' });
		expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, 'extract.err.rateLimited');
	});

	it('reports "completed" for a permanent error even with retries left — the app already dead-lettered it', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockRejectedValue(new Error('boom'));

		const result = await runExtractionJobForBoss(pgBossJob(0, 2));

		expect(result).toEqual({ id: 'pgboss-job-1', status: 'completed' });
		expect(deadLetterMocks.recordDeadLetter).toHaveBeenCalledTimes(1);
	});

	it('reports "completed" on a successful extraction', async () => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockResolvedValue({
			invoice: { supplier_name: 'Acme', line_items: [] }, usage: {},
		});

		const result = await runExtractionJobForBoss(pgBossJob(0, 2));

		expect(result).toEqual({ id: 'pgboss-job-1', status: 'completed' });
	});

	it('routes a genuinely unexpected exception through the shared retriesLeft policy, not the extraction classifier', async () => {
		batchMocks.getItem.mockRejectedValueOnce(new Error('connection reset'));

		const retried = await runExtractionJobForBoss(pgBossJob(0, 2));
		expect(retried).toEqual({ id: 'pgboss-job-1', status: 'failed' });
		expect(deadLetterMocks.recordDeadLetter).not.toHaveBeenCalled();

		batchMocks.getItem.mockRejectedValueOnce(new Error('connection reset'));
		const final = await runExtractionJobForBoss(pgBossJob(2, 2));
		expect(final).toEqual({ id: 'pgboss-job-1', status: 'deadletter' });
		expect(deadLetterMocks.recordDeadLetter).toHaveBeenCalledTimes(1);
	});
});

/**
 * Issue #808: the line-sum-vs-total reconciliation used to run only inside
 * `saveReviewedInvoice`, gated behind a human opening the review screen and
 * saving the form. A clean PDF whose lines Gemini misread could sit as
 * `status: 'done'` with nothing marking it as an incidence. The worker now
 * runs the same reconciliation on the raw extraction the moment it lands,
 * before `markDone` — independent of whether anyone ever opens the review
 * form.
 */
function invoiceFor(totalAmount: number | null, lineTotals: number[], taxBreakdown?: unknown[]) {
	return {
		supplier_name: 'Acme',
		total_amount: totalAmount,
		...(taxBreakdown ? { tax_breakdown: taxBreakdown } : {}),
		line_items: lineTotals.map((total_price, i) => ({ description: String.fromCharCode(97 + i), total_price })),
	};
}

const TOTAL_MISMATCH_CASES = [
	{ label: 'the extracted lines do not sum to the extracted total', invoice: invoiceFor(100, [40, 30]), expected: true },
	{ label: 'the extracted lines reconcile with the extracted total', invoice: invoiceFor(100, [60, 40]), expected: false },
	{ label: 'a printed tax breakdown accounts for the gap', invoice: invoiceFor(121, [100], [{ rate: 0.21, base: 100, tax_amount: 21 }]), expected: false },
	{ label: 'there is no usable extracted total to reconcile against', invoice: invoiceFor(null, [40]), expected: false },
	{
		label: 'a gestoría invoice with a discount and IRPF retention reconciles once extras are subtracted (#916)',
		invoice: { ...invoiceFor(106, [100], [{ rate: 0.21, base: 100, tax_amount: 21 }]), discount_amount: 10, retention_amount: 5 },
		expected: false,
	},
] as const;

describe('processExtractionJob — total mismatch is detected at extraction time (#808)', () => {
	it.each(TOTAL_MISMATCH_CASES)('total_mismatch is $expected when $label', async ({ invoice, expected }) => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockResolvedValue({ invoice, usage: {} });

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 0, retryLimit: 2 });

		expect(batchMocks.markDone).toHaveBeenCalledWith(
			item.id,
			expect.objectContaining({ total_mismatch: expected }),
			expect.anything(),
		);
	});
});

/**
 * Issue #919: invoice_line_items.tax_rate is filled from what the document
 * prints on each line — the worker's job is only to carry it from the raw
 * extraction (or the einvoice parser) through annotateLineItems into
 * extracted_data.line_items untouched.
 */
const TAX_RATE_PASSTHROUGH_CASES = [
	{
		label: 'a mixed-rate invoice where each line prints its own rate',
		rawLineItems: [
			{ description: 'food', total_price: 50, tax_rate: 0.10 },
			{ description: 'cleaning', total_price: 50, tax_rate: 0.21 },
		],
		expectedRates: [0.10, 0.21],
	},
	{
		label: 'a line that printed no rate of its own',
		rawLineItems: [{ description: 'mystery item', total_price: 100 }],
		expectedRates: [null],
	},
] as const;

describe('processExtractionJob — per-line tax_rate passes through to extracted_data (#919)', () => {
	it.each(TAX_RATE_PASSTHROUGH_CASES)('carries tax_rate into extracted_data.line_items for $label', async ({ rawLineItems, expectedRates }) => {
		batchMocks.markExtracting.mockResolvedValue(true);
		extractMocks.extractWithProvider.mockResolvedValue({
			invoice: { supplier_name: 'Acme', total_amount: 100, line_items: rawLineItems },
			usage: {},
		});

		await processExtractionJob(job, undefined, RETRIES_LEFT);

		expect(batchMocks.markDone).toHaveBeenCalledWith(
			item.id,
			expect.objectContaining({
				line_items: expectedRates.map((tax_rate) => expect.objectContaining({ tax_rate })),
			}),
			expect.anything(),
		);
	});
});

/**
 * Composite documents (docs/03_features/multi_invoice_document_detection.md).
 *
 * A supplier packet — one PDF holding a cover listing and seventeen facturas —
 * used to reach the single-invoice extractor whole and come back as one
 * invoice with one total. The worker now asks what the document IS before it
 * asks what its fields are, and the answer decides the route: extract it,
 * fan it out into one item per document, or stop and ask for a human. The
 * quota accounting has to follow that route — a document the worker never
 * extracted must not cost the tenant an extraction.
 */
describe('processExtractionJob — composite documents are separated before extraction', () => {
	beforeEach(() => {
		fs.mkdirSync('/tmp/uploads/ns', { recursive: true });
		fs.writeFileSync('/tmp/uploads/ns/a.pdf', '%PDF-1.4');
		batchMocks.markExtracting.mockResolvedValue(true);
		segmentationMocks.isSegmentableDocument.mockReturnValue(true);
	});

	afterEach(() => {
		segmentationMocks.isSegmentableDocument.mockReturnValue(false);
	});

	async function runRouted(structureResult: unknown, rejects = false) {
		if (rejects) segmentationMocks.segmentDocument.mockRejectedValue(structureResult);
		else if (typeof structureResult === 'function') segmentationMocks.segmentDocument.mockImplementation(structureResult as (...args: unknown[]) => unknown);
		else segmentationMocks.segmentDocument.mockResolvedValue(structureResult);
		extractMocks.extractWithProvider.mockResolvedValue({
			invoice: { supplier_name: 'Acme', line_items: [] },
			usage: {},
		});
		await processExtractionJob(job, undefined, RETRIES_LEFT);
	}

	const SPLIT = { action: 'split', itemIds: ['child-1', 'child-2'] };
	const REVIEW = { action: 'review', reason: 'extract.err.structureUnclear' };

	it('extracts nothing itself once the document has been fanned out', async () => {
		await runRouted(SPLIT);

		expect(extractMocks.extractWithProvider).not.toHaveBeenCalled();
		expect(batchMocks.markDone).not.toHaveBeenCalled();
		expect(batchMocks.markFailed).not.toHaveBeenCalled();
	});

	it('queues each new document it created, since a pending item is never claimed', async () => {
		await runRouted(SPLIT);

		const [, segmentDeps] = segmentationMocks.segmentDocument.mock.calls[0] as unknown as
			[unknown, { enqueue: (id: string) => Promise<unknown> }];
		await segmentDeps.enqueue('child-1');

		expect(batchMocks.markQueued).toHaveBeenCalledWith('child-1');
		expect(queueMocks.enqueueExtraction).toHaveBeenCalledWith('child-1', 'r1');
	});

	it.each([
		{ label: 'fanned out into its own documents', outcome: SPLIT },
		{ label: 'sent to review as unclear', outcome: REVIEW },
	])('gives the tenant back the extraction slot of a document $label', async ({ outcome }) => {
		await runRouted(outcome);

		expect(quotaMocks.releaseMonthlyExtraction).toHaveBeenCalledWith('r1', item.id, expect.any(String));
		expect(extractMocks.extractWithProvider).not.toHaveBeenCalled();
	});

	const QUOTA_KEY = 'extract.err.quotaCompositeExceeded';

	it('refuses a packet larger than the plan allowance without extracting any of it', async () => {
		await runRouted({ action: 'quota', reason: QUOTA_KEY, found: 17, remaining: 8 });

		expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, QUOTA_KEY, { found: 17, remaining: 8 });
		expect(extractMocks.extractWithProvider).not.toHaveBeenCalled();
		expect(translations.es[QUOTA_KEY]).toContain('{found}');
		expect(translations.es[QUOTA_KEY]).toContain('{remaining}');
		expect(translations.en[QUOTA_KEY]).toBeTruthy();
	});

	it('hands back the container document\'s own slot before pricing the packet, so N left buys N', async () => {
		await runRouted(async (_src: unknown, deps: { reserve: (n: number) => Promise<unknown> }) => {
			await deps.reserve(3);
			return SPLIT;
		});

		const releaseOrder = quotaMocks.releaseMonthlyExtraction.mock.invocationCallOrder[0];
		const reserveOrder = quotaMocks.reserveMonthlyExtractions.mock.invocationCallOrder[0];
		expect(releaseOrder).toBeLessThan(reserveOrder);
		expect(quotaMocks.reserveMonthlyExtractions).toHaveBeenCalledWith('r1', 3);
	});

	it('fails a document whose structure is unclear instead of extracting it as one invoice', async () => {
		await runRouted(REVIEW);

		expect(batchMocks.markFailed).toHaveBeenCalledWith(item.id, 'extract.err.structureUnclear');
		expect(translations.es['extract.err.structureUnclear']).toBeTruthy();
		expect(translations.en['extract.err.structureUnclear']).toBeTruthy();
	});

	it.each([
		{ label: 'the document holds exactly one invoice', result: { action: 'extract' }, rejects: false },
		{ label: 'structure detection itself breaks', result: new Error('pdf parse failed'), rejects: true },
	])('extracts as usual when $label', async ({ result, rejects }) => {
		await runRouted(result, rejects);

		expect(batchMocks.markDone).toHaveBeenCalledTimes(1);
	});

	it('retries instead of extracting when the classifier is rate limited', async () => {
		await runRouted(rateLimited, true);

		expect(extractMocks.extractWithProvider).not.toHaveBeenCalled();
		expect(batchMocks.markFailed).not.toHaveBeenCalled();
		expect(quotaMocks.releaseMonthlyExtraction).toHaveBeenCalledWith('r1', item.id, expect.any(String));
	});
});

/**
 * Issue #905: the tester's document printed no emisor/cliente labels, so the
 * model picked a party and the restaurant itself was stored as a brand-new
 * supplier while the real issuer — already in the database — was never
 * recognised. Extraction now reports both parties and the worker decides,
 * before annotateLineItems and markDone see a supplier name: everything
 * downstream, the review screen included, reads the corrected pair.
 */
const swappedInvoice = {
	supplier_name: 'Clínica Dental Víctor Granda',
	supplier_nif: '47306879L',
	supplier_email: 'hola@clinica.example',
	supplier_category: 'Material y Menaje',
	receiver_name: 'Elaboradental SL',
	receiver_nif: 'B99999997',
	total_amount: 100,
	line_items: [{ description: 'Férula', total_price: 100 }],
};

const PARTY_CASES = [
	{
		label: 'the document names the restaurant as emisor',
		identity: { taxId: '47306879L', names: ['Clínica Dental Víctor Granda'] },
		expected: {
			supplier_name: 'Elaboradental SL',
			supplier_nif: 'B99999997',
			supplier_email: null,
			supplier_category: null,
			receiver_name: 'Clínica Dental Víctor Granda',
		},
	},
	{
		label: 'the restaurant has no fiscal identity on file',
		identity: { taxId: null, names: [] },
		expected: { supplier_name: 'Clínica Dental Víctor Granda', supplier_nif: '47306879L' },
	},
] as const;

describe('processExtractionJob — emisor/receptor assignment (#905)', () => {
	it.each(PARTY_CASES)('stores $expected.supplier_name as the supplier when $label', async ({ identity, expected }) => {
		batchMocks.markExtracting.mockResolvedValue(true);
		partyMocks.ownPartyIdentity.mockResolvedValue({ taxId: identity.taxId, names: [...identity.names] });
		extractMocks.extractWithProvider.mockResolvedValue({ invoice: swappedInvoice, usage: {} });

		await processExtractionJob({ itemId: item.id, restaurantId: 'r1' }, undefined, { retryCount: 0, retryLimit: 2 });

		expect(batchMocks.markDone).toHaveBeenCalledWith(item.id, expect.objectContaining(expected), expect.anything());
	});
});
