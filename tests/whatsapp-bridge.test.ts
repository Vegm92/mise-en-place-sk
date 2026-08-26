/**
 * WhatsApp → batch pipeline bridge (issue #349, #350, ADR-004).
 *
 * An inbound media message creates a batch/item via the shared batch-core
 * pipeline and hands off confirmation to /batch/[id] — the only path since
 * the legacy inline extraction + SÍ/NO handshake was removed in #350.
 * batch-core.ts, extract-batch.ts and queue.ts are mocked at the module
 * boundary so this file only pins whatsapp-bot.ts's own wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	dbMock, sendMock, downloadMock, saveMock, rateLimitMock,
	createBatchMock, enqueueBatchMock, enqueueExtractionMock,
	claimMock, releaseMock,
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
		claimMock: vi.fn().mockResolvedValue(true),
		releaseMock: vi.fn().mockResolvedValue(undefined),
		selectQueue,
		insertQueue,
	};
});

vi.mock('../src/lib/server/db', () => ({ db: dbMock }));
vi.mock('../src/lib/server/idempotency', () => ({
	WHATSAPP_SCOPE: 'whatsapp',
	claimIdempotencyKey: claimMock,
	releaseIdempotencyKey: releaseMock,
}));
vi.mock('../src/lib/server/whatsapp', async (importActual) => ({
	...(await importActual<typeof import('../src/lib/server/whatsapp')>()),
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
vi.mock('../src/lib/server/billing', () => ({
	getAccessState: vi.fn().mockResolvedValue({
		allowed: true, status: 'active', trialEndsAt: null, trialExpired: false,
	}),
}));
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
	APP_BASE_URL: 'https://app.example.com',
}));

import { handleWhatsAppMessage } from '../src/lib/server/whatsapp-bot';
import { MediaTooLargeError } from '../src/lib/server/whatsapp';
import { MAX_FILE_BYTES } from '../src/lib/server/file-validation';

const CONTACT = [{ restaurantId: 'rest-1' }];

/** A buffer that passes the JPEG magic-byte check (SOI + APP0 marker). */
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);

function repliesText() {
	return sendMock.mock.calls.map((c) => c[1] as string).join('\n');
}

/** Contact lookup. */
function queueRouting() {
	selectQueue.length = 0;
	selectQueue.push(CONTACT);
}

beforeEach(() => {
	vi.clearAllMocks();
	selectQueue.length = 0;
	insertQueue.length = 0;
	rateLimitMock.mockResolvedValue(true);
	claimMock.mockResolvedValue(true);
	releaseMock.mockResolvedValue(undefined);
	createBatchMock.mockResolvedValue({ batchId: 'batch-1', itemIds: ['item-1'] });
vi.mock('../src/lib/server/locations', () => ({ isLocationLocked: vi.fn().mockResolvedValue(false) }));
});

describe('WhatsApp → batch bridge', () => {
	it('creates a batch/item tagged with its origin, enqueues extraction, and acknowledges', async () => {
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(createBatchMock).toHaveBeenCalledWith(
			'rest-1',
			[{ key: expect.stringMatching(/^whatsapp\/rest-1\//), name: expect.any(String) }],
			{ source: 'whatsapp', sourceRef: '+34600', jobCode: expect.stringMatching(/^[A-Z0-9]{4}$/) },
		);
		expect(enqueueBatchMock).toHaveBeenCalledWith('item-1', 'rest-1', expect.objectContaining({
			enqueue: enqueueExtractionMock,
		}));
		// The ack only says the invoice arrived — the summary with the extracted
		// data comes back from the worker once extraction finishes.
		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(repliesText()).toMatch(/Factura recibida/i);
		// No inline extracted-data summary, no SÍ/NO prompt on this path.
		expect(repliesText()).not.toMatch(/¿Confirmas esta factura\?/);
	});

	it('does not claim or run inline extraction on the batch path', async () => {
		const { extractWithProvider } = await import('../src/lib/server/extract');
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(extractWithProvider).not.toHaveBeenCalled();
	});

	it('replies with an error and does not create a batch when the media download fails', async () => {
		downloadMock.mockRejectedValue(new Error('404 from Meta'));
		queueRouting();

		await expect(
			handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } }),
		).rejects.toThrow('404 from Meta');

		expect(createBatchMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/No he podido descargar el archivo/i);
	});

	it('replies with an error and does not create a batch when storage save fails', async () => {
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		saveMock.mockRejectedValueOnce(new Error('disk full'));
		queueRouting();

		await expect(
			handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } }),
		).rejects.toThrow('disk full');

		expect(createBatchMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/No he podido guardar el archivo/i);
	});
});

/**
 * Issue #483: the message id was claimed up front and never released, so any
 * failure before the invoice actually entered the pipeline discarded it for
 * good — a redelivery of the same id was skipped as a duplicate. The claim is
 * now released on failure, but only up to the commit point (batch created and
 * extraction enqueued); past that the invoice IS ingested and a release would
 * let a redelivery create a second batch.
 */
describe('idempotency claim release before the commit point (issue #483)', () => {
	const MEDIA = { from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } };

	it('releases the claim when the media download fails, so a resend is processed', async () => {
		downloadMock.mockRejectedValue(new Error('404 from Meta'));
		queueRouting();

		await expect(handleWhatsAppMessage({ ...MEDIA })).rejects.toThrow();
		expect(releaseMock).toHaveBeenCalledWith('whatsapp', 'm1');

		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		queueRouting();
		await handleWhatsAppMessage({ ...MEDIA });
		expect(createBatchMock).toHaveBeenCalledTimes(1);
	});

	it('releases the claim when the storage write fails', async () => {
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		saveMock.mockRejectedValueOnce(new Error('disk full'));
		queueRouting();

		await expect(handleWhatsAppMessage({ ...MEDIA })).rejects.toThrow();
		expect(releaseMock).toHaveBeenCalledWith('whatsapp', 'm1');
	});

	it('releases the claim when the batch insert fails', async () => {
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		createBatchMock.mockRejectedValueOnce(new Error('deadlock detected'));
		queueRouting();

		await expect(handleWhatsAppMessage({ ...MEDIA })).rejects.toThrow();
		expect(releaseMock).toHaveBeenCalledWith('whatsapp', 'm1');
	});

	it('releases the claim when the extraction enqueue fails', async () => {
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		enqueueBatchMock.mockRejectedValueOnce(new Error('boss is down'));
		queueRouting();

		await expect(handleWhatsAppMessage({ ...MEDIA })).rejects.toThrow();
		expect(releaseMock).toHaveBeenCalledWith('whatsapp', 'm1');
	});

	it('keeps the claim when the confirmation reply fails after the enqueue', async () => {
		// Past the commit point the invoice is ingested; releasing here would
		// let a redelivery create a second batch for the same photo.
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		sendMock.mockRejectedValueOnce(new Error('Meta 500'));
		queueRouting();

		await expect(handleWhatsAppMessage({ ...MEDIA })).rejects.toThrow();
		expect(enqueueBatchMock).toHaveBeenCalled();
		expect(releaseMock).not.toHaveBeenCalled();
	});

	it('keeps the claim on a duplicate delivery and does no work', async () => {
		claimMock.mockResolvedValue(false);
		queueRouting();

		await handleWhatsAppMessage({ ...MEDIA });

		expect(downloadMock).not.toHaveBeenCalled();
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(releaseMock).not.toHaveBeenCalled();
	});
});

/**
 * Issue #483: the WhatsApp path buffered whatever Meta handed over, with no
 * size cap and no content check — the two guards the web upload path has had
 * since #217. Both share src/lib/server/file-validation.ts now.
 */
describe('media validation (issue #483)', () => {
	const MEDIA = { from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } };

	it('refuses an oversized file without creating a batch, and keeps the claim', async () => {
		// Rejection is a handled outcome, not a failure: the message WAS
		// processed correctly, so a redelivery of the same bad file is
		// still a duplicate and must stay skipped.
		downloadMock.mockRejectedValue(new MediaTooLargeError(MAX_FILE_BYTES + 1));
		queueRouting();

		await handleWhatsAppMessage({ ...MEDIA });

		expect(saveMock).not.toHaveBeenCalled();
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(releaseMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/demasiado grande/i);
	});

	it('refuses a file whose bytes do not match its extension', async () => {
		downloadMock.mockResolvedValue({ buffer: Buffer.from('MZ not a jpeg'), extension: 'jpg' });
		queueRouting();

		await handleWhatsAppMessage({ ...MEDIA });

		expect(saveMock).not.toHaveBeenCalled();
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(releaseMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/dañado o no es lo que dice ser/i);
	});

	it('refuses an extension outside the allow-list', async () => {
		downloadMock.mockResolvedValue({ buffer: Buffer.from('#!/bin/sh'), extension: 'sh' });
		queueRouting();

		await handleWhatsAppMessage({ ...MEDIA });

		expect(createBatchMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/Ese tipo de archivo no me sirve/i);
	});

	it('accepts a PDF whose bytes match', async () => {
		downloadMock.mockResolvedValue({
			buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]),
			extension: 'pdf',
		});
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'document', document: { id: 'media-1' } });

		expect(createBatchMock).toHaveBeenCalled();
	});
});

/**
 * Issue #483: only unknown numbers were throttled, so an authorised contact
 * could pin the extraction queue and the LLM quota with a burst of photos.
 */
describe('per-sender rate limit (issue #483)', () => {
	it('turns an authorised sender away past the hourly cap, before downloading', async () => {
		rateLimitMock.mockResolvedValue(false);
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(downloadMock).not.toHaveBeenCalled();
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/demasiadas facturas seguidas/i);
	});

	it('keys the limit on the sender, over an hour window', async () => {
		downloadMock.mockResolvedValue({ buffer: JPEG, extension: 'jpg' });
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });

		expect(rateLimitMock).toHaveBeenCalledWith('whatsapp:+34600', expect.any(Number), 3600);
	});

	it('does not throttle a plain text message', async () => {
		queueRouting();

		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'text', text: { body: 'hola' } });

		expect(rateLimitMock).not.toHaveBeenCalled();
	});
});
