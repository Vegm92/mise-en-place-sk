import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/sveltekit', () => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
}));

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

vi.mock('../src/lib/server/dead-letter.js', () => ({
	recordDeadLetter: vi.fn(),
}));

vi.mock('../src/lib/server/sessions.js', () => ({
	uploadsDir: () => '/tmp/uploads',
}));

vi.mock('../src/lib/server/storage.js', () => ({
	getStorage: () => ({ read: vi.fn() }),
}));

const { processExtractionJob } = await import('../src/lib/server/extraction-worker');

const rateLimited = Object.assign(new Error('rate limited'), { status: 429 });
vi.mock('../src/lib/server/locations.js', () => ({ isLocationLocked: vi.fn().mockResolvedValue(false) }));

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
