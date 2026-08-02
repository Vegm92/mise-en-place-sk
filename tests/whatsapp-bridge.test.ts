/**
 * WhatsApp → batch pipeline bridge (issue #349, ADR-004).
 *
 * With WHATSAPP_USE_BATCH_PIPELINE on, an inbound media message must create a
 * batch/item via the shared batch-core pipeline and hand off confirmation to
 * /batch/[id] instead of running the legacy inline extraction + SÍ/NO
 * handshake. batch-core.ts, extract-batch.ts and queue.ts are mocked at the
 * module boundary so this file only pins whatsapp-bot.ts's own wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	dbMock, sendMock, downloadMock, saveMock, rateLimitMock,
	createBatchMock, enqueueBatchMock, enqueueExtractionMock,
	selectQueue, insertQueue,
} = vi.hoisted(() => {
	const selectQueue: unknown[][] = [];
	const insertQueue: unknown[][] = [];

	function chain(result: unknown) {
		const c: unknown = new Proxy(
			{},
			{
				get(_t, prop) {
					if (prop === 'then') {
						return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
							Promise.resolve(result).then(res, rej);
					}
					if (typeof prop === 'symbol') return undefined;
					return () => c;
				},
			},
		);
		return c;
	}

	const dbMock = {
		select: vi.fn(() => chain(selectQueue.length ? selectQueue.shift() : [])),
		update: vi.fn(() => chain([{ id: 7 }])),
		insert: vi.fn(() => chain(insertQueue.length ? insertQueue.shift() : [{ messageId: 'seed' }])),
		transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
			fn({ select: () => chain([]), insert: () => chain([{ id: 1 }]) }),
		),
	};

	return {
		dbMock,
		sendMock: vi.fn().mockResolvedValue(undefined),
		downloadMock: vi.fn(),
		saveMock: vi.fn().mockResolvedValue(undefined),
		rateLimitMock: vi.fn().mockResolvedValue(true),
		createBatchMock: vi.fn(),
		enqueueBatchMock: vi.fn().mockResolvedValue(undefined),
		enqueueExtractionMock: vi.fn().mockResolvedValue(true),
		selectQueue,
		insertQueue,
	};
});

vi.mock('../src/lib/server/db', () => ({ db: dbMock }));
vi.mock('../src/lib/server/whatsapp', () => ({
	sendWhatsAppMessage: sendMock,
	downloadWhatsAppMedia: downloadMock,
}));
vi.mock('../src/lib/server/extract', () => ({ extractWithProvider: vi.fn() }));
vi.mock('../src/lib/server/storage', () => ({ getStorage: () => ({ save: saveMock }) }));
vi.mock('../src/lib/server/llm-quota', () => ({
	claimMonthlyExtraction: vi.fn().mockResolvedValue({ claimed: true }),
	releaseMonthlyExtraction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('../src/lib/server/whatsapp-pairing', async (importActual) => ({
	...(await importActual<typeof import('../src/lib/server/whatsapp-pairing')>()),
	redeemPairingCode: vi.fn(),
}));
vi.mock('@sentry/sveltekit', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock('../src/lib/server/batch', () => ({
	createBatch: createBatchMock,
	getItem: vi.fn(),
	getBatchItems: vi.fn(),
	markQueued: vi.fn(),
}));
vi.mock('../src/lib/server/extract-batch', () => ({ enqueueBatchExtraction: enqueueBatchMock }));
vi.mock('../src/lib/server/queue', () => ({ enqueueExtraction: enqueueExtractionMock }));
vi.mock('../src/lib/server/env', async (importActual) => ({
	...(await importActual<typeof import('../src/lib/server/env')>()),
	WHATSAPP_USE_BATCH_PIPELINE: true,
	APP_BASE_URL: 'https://app.example.com',
}));

import { handleWhatsAppMessage } from '../src/lib/server/whatsapp-bot';

const CONTACT = [{ restaurantId: 'rest-1' }];

function repliesText() {
	return sendMock.mock.calls.map((c) => c[1] as string).join('\n');
}

/** Contact lookup, then the pending-legacy-session guard lookup. */
function queueRouting(session: unknown[] = []) {
	selectQueue.length = 0;
	selectQueue.push(CONTACT, session);
}

beforeEach(() => {
	vi.clearAllMocks();
	selectQueue.length = 0;
	insertQueue.length = 0;
	rateLimitMock.mockResolvedValue(true);
	createBatchMock.mockResolvedValue({ batchId: 'batch-1', itemIds: ['item-1'] });
});

describe('WhatsApp → batch bridge (flag on)', () => {
	it('creates a batch/item, enqueues extraction, and replies with a /batch/[id] link', async () => {
		downloadMock.mockResolvedValue({ buffer: Buffer.from('img'), extension: 'jpg' });
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(createBatchMock).toHaveBeenCalledWith(
			'rest-1',
			[{ key: expect.stringMatching(/^whatsapp\/rest-1\//), name: expect.any(String) }],
		);
		expect(enqueueBatchMock).toHaveBeenCalledWith('item-1', 'rest-1', expect.objectContaining({
			enqueue: enqueueExtractionMock,
		}));
		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(repliesText()).toContain('https://app.example.com/batch/batch-1');
		// No inline extracted-data summary, no SÍ/NO prompt on this path.
		expect(repliesText()).not.toMatch(/¿Confirmas esta factura\?/);
	});

	it('does not claim or run inline extraction on the batch path', async () => {
		const { extractWithProvider } = await import('../src/lib/server/extract');
		downloadMock.mockResolvedValue({ buffer: Buffer.from('img'), extension: 'jpg' });
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(extractWithProvider).not.toHaveBeenCalled();
	});

	it('replies with an error and does not create a batch when the media download fails', async () => {
		downloadMock.mockRejectedValue(new Error('404 from Meta'));
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(createBatchMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/No he podido descargar el archivo/i);
	});

	it('replies with an error and does not create a batch when storage save fails', async () => {
		downloadMock.mockResolvedValue({ buffer: Buffer.from('img'), extension: 'jpg' });
		saveMock.mockRejectedValueOnce(new Error('disk full'));
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(createBatchMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/No he podido guardar el archivo/i);
	});

	it('still blocks a new upload while a legacy session is awaiting confirmation', async () => {
		const LEGACY_SESSION = [{ id: 7, restaurantId: 'rest-1', fromNumber: '+34600', status: 'awaiting_confirmation' }];
		queueRouting(LEGACY_SESSION);

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(repliesText()).toMatch(/factura pendiente de confirmación/i);
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(downloadMock).not.toHaveBeenCalled();
	});
});
