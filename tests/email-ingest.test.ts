/**
 * Email ingest pipeline (issue #236, ADR-004 extended to a third channel).
 *
 * The webhook's own job (signature + envelope parsing) is covered by
 * email-ingest-webhook.test.ts. This file pins ingestInboundEmail: it must
 * resolve the recipient token to a tenant, apply the same rate limit and
 * quota gate as web upload, hand valid attachments to the real
 * saveUploadedFiles/createBatch/enqueueBatchExtraction pipeline (mocked only
 * at the module boundary, per ADR-004 — no reimplemented extraction, dedup
 * or line-item insert), and reject everything else without silently
 * dropping it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	dbMock, selectQueue,
	rateLimitMock, entitlementsMock, remainingQuotaMock,
	createBatchMock, enqueueBatchMock, enqueueExtractionMock,
	claimMock, releaseMock, sendEmailMock, getResendClientMock,
	store,
} = vi.hoisted(() => {
	const selectQueue: unknown[][] = [];
	const store = new Map<string, Buffer>();

	function chain(result: unknown) {
		const c: unknown = new Proxy({}, {
			get(_t, prop) {
				if (prop === 'then') {
					return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
						Promise.resolve(result).then(res, rej);
				}
				if (typeof prop === 'symbol') return undefined;
				return () => c;
			},
		});
		return c;
	}

	const dbMock = {
		select: vi.fn(() => chain(selectQueue.length ? selectQueue.shift() : [])),
	};

	return {
		dbMock, selectQueue,
		rateLimitMock: vi.fn().mockResolvedValue(true),
		remainingQuotaMock: vi.fn().mockResolvedValue(null),
		entitlementsMock: vi.fn().mockResolvedValue({
			access: { allowed: true, status: 'active', trialEndsAt: null, trialExpired: false },
			monthlyQuota: null,
		}),
		createBatchMock: vi.fn().mockResolvedValue({ batchId: 'batch-1', itemIds: ['item-1'] }),
		enqueueBatchMock: vi.fn().mockResolvedValue(undefined),
		enqueueExtractionMock: vi.fn().mockResolvedValue(true),
		claimMock: vi.fn().mockResolvedValue(true),
		releaseMock: vi.fn().mockResolvedValue(undefined),
		sendEmailMock: vi.fn().mockResolvedValue(undefined),
		getResendClientMock: vi.fn(),
		store,
	};
});

vi.mock('../src/lib/server/db', () => ({
	db: dbMock,
	runAsSystem: (fn: () => unknown) => fn(),
	runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../src/lib/server/env', () => ({ EMAIL_INGEST_ENABLED: 'true', EMAIL_INGEST_DOMAIN: 'ingest.example.com' }));
vi.mock('../src/lib/server/billing', () => ({ getEntitlements: entitlementsMock }));
vi.mock('../src/lib/server/rate-limit-scope', () => ({ rateLimitScoped: rateLimitMock }));
vi.mock('../src/lib/server/llm-quota', () => ({ remainingMonthlyQuota: remainingQuotaMock }));
vi.mock('../src/lib/server/storage', () => ({
	getStorage: () => ({
		save: async (key: string, buf: Buffer) => { store.set(key, buf); },
	}),
}));
vi.mock('../src/lib/server/batch', () => ({
	createBatch: createBatchMock,
	getItem: vi.fn(),
	getBatchItems: vi.fn(),
	markQueued: vi.fn(),
}));
vi.mock('../src/lib/server/extract-batch', () => ({ enqueueBatchExtraction: enqueueBatchMock }));
vi.mock('../src/lib/server/queue', () => ({ enqueueExtraction: enqueueExtractionMock }));
vi.mock('../src/lib/server/idempotency', () => ({
	claimIdempotencyKey: claimMock,
	releaseIdempotencyKey: releaseMock,
}));
vi.mock('../src/lib/server/email', () => ({
	sendEmail: sendEmailMock,
	emailIngestRejectedEmail: (to: string, name: string, rejected: unknown) => ({ to, name, rejected }),
	getResendClient: getResendClientMock,
}));

import {
	ingestAddress, getIngestAddress, ingestInboundEmail, fetchResendAttachment, type InboundEmailMessage,
} from '../src/lib/server/email-ingest';
import { MAX_FILE_BYTES, MediaTooLargeError } from '../src/lib/server/file-validation';

/** Pads well-formed leading bytes past the 1 KB minimum-size floor with trailing zeros. */
function padToMinSize(bytes: number[], min = 1100): Buffer {
	return Buffer.from(bytes.length >= min ? bytes : [...bytes, ...new Array(min - bytes.length).fill(0)]);
}

const VALID_PDF = padToMinSize([0x25, 0x50, 0x44, 0x46, 0x2d]);

function msg(overrides: Partial<InboundEmailMessage> = {}): InboundEmailMessage {
	return {
		emailId: 'email-1',
		from: 'proveedor@example.com',
		to: ['tok-rest-1@ingest.example.com'],
		attachments: [{ id: 'att-1', filename: 'factura.pdf', contentType: 'application/pdf', contentDisposition: null }],
		...overrides,
	};
}

function fetchAttachment(buf: Buffer = VALID_PDF) {
	return { fetchAttachment: vi.fn().mockResolvedValue(buf) };
}

const RESTAURANT_ROW = [{ id: 'rest-1', name: 'Casa Pepe' }];

beforeEach(() => {
	vi.clearAllMocks();
	selectQueue.length = 0;
	store.clear();
	rateLimitMock.mockResolvedValue(true);
	remainingQuotaMock.mockResolvedValue(null);
	claimMock.mockResolvedValue(true);
	releaseMock.mockResolvedValue(undefined);
	sendEmailMock.mockResolvedValue(undefined);
	createBatchMock.mockResolvedValue({ batchId: 'batch-1', itemIds: ['item-1'] });
	entitlementsMock.mockResolvedValue({
		access: { allowed: true, status: 'active', trialEndsAt: null, trialExpired: false },
		monthlyQuota: null,
	});
});

describe('ingestAddress / getIngestAddress', () => {
	it('builds the address from the token and the configured domain', () => {
		expect(ingestAddress('abc-123')).toBe('abc-123@ingest.example.com');
	});

	it('returns the address for a known restaurant', async () => {
		selectQueue.push([{ token: 'abc-123' }]);
		await expect(getIngestAddress('rest-1')).resolves.toBe('abc-123@ingest.example.com');
	});

	it('returns null when the restaurant has no row', async () => {
		selectQueue.push([]);
		await expect(getIngestAddress('rest-1')).resolves.toBeNull();
	});
});

describe('ingestInboundEmail — happy path', () => {
	it('resolves the recipient, creates a batch tagged with its origin, and enqueues extraction', async () => {
		selectQueue.push(RESTAURANT_ROW);
		const outcome = await ingestInboundEmail(msg(), fetchAttachment(), 'req-1');

		expect(outcome).toEqual({ kind: 'ingested', restaurantId: 'rest-1', batchId: 'batch-1' });
		expect(createBatchMock).toHaveBeenCalledWith(
			'rest-1',
			[{ key: expect.any(String), name: expect.stringContaining('factura') }],
			{ source: 'email', sourceRef: 'proveedor@example.com' },
		);
		expect(enqueueBatchMock).toHaveBeenCalledWith('item-1', 'rest-1', expect.objectContaining({
			enqueue: expect.any(Function),
		}), 'req-1');
		expect(claimMock).toHaveBeenCalledWith('email-ingest', 'email-1');
		expect(releaseMock).not.toHaveBeenCalled();
	});

	it('applies the exact same rate-limit bucket as web upload', async () => {
		selectQueue.push(RESTAURANT_ROW);
		await ingestInboundEmail(msg(), fetchAttachment());
		expect(rateLimitMock).toHaveBeenCalledWith({ scope: 'tenant', name: 'upload', max: 10 }, { restaurantId: 'rest-1' });
	});

	it('ignores inline attachments (e.g. an embedded signature logo)', async () => {
		selectQueue.push(RESTAURANT_ROW);
		const inline = { id: 'att-2', filename: 'logo.png', contentType: 'image/png', contentDisposition: 'inline' };
		const deps = fetchAttachment();
		await ingestInboundEmail(msg({ attachments: [msg().attachments[0]!, inline] }), deps);
		expect(deps.fetchAttachment).toHaveBeenCalledTimes(1);
		expect(deps.fetchAttachment).toHaveBeenCalledWith('email-1', 'att-1');
	});
});

describe('ingestInboundEmail — gates shared with web upload', () => {
	it('is a no-op when the feature flag is off, without claiming', async () => {
		vi.resetModules();
		vi.doMock('../src/lib/server/env', () => ({ EMAIL_INGEST_ENABLED: '', EMAIL_INGEST_DOMAIN: 'ingest.example.com' }));
		const mod = await import('../src/lib/server/email-ingest');
		const outcome = await mod.ingestInboundEmail(msg(), fetchAttachment());
		expect(outcome).toEqual({ kind: 'disabled' });
		expect(claimMock).not.toHaveBeenCalled();
		vi.doUnmock('../src/lib/server/env');
	});

	it('rejects an unknown recipient without creating a batch, keeping the claim', async () => {
		selectQueue.push([]);
		const outcome = await ingestInboundEmail(msg(), fetchAttachment());
		expect(outcome).toEqual({ kind: 'unknown-recipient' });
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(releaseMock).not.toHaveBeenCalled();
	});

	it('skips a redelivery of the same provider event id', async () => {
		claimMock.mockResolvedValue(false);
		const outcome = await ingestInboundEmail(msg(), fetchAttachment());
		expect(outcome).toEqual({ kind: 'duplicate' });
		expect(dbMock.select).not.toHaveBeenCalled();
	});

	it('denies an inactive/trial-expired tenant', async () => {
		selectQueue.push(RESTAURANT_ROW);
		entitlementsMock.mockResolvedValue({
			access: { allowed: false, status: 'trialing', trialEndsAt: null, trialExpired: true },
			monthlyQuota: null,
		});
		const outcome = await ingestInboundEmail(msg(), fetchAttachment());
		expect(outcome).toEqual({ kind: 'access-denied' });
		expect(createBatchMock).not.toHaveBeenCalled();
	});

	it('turns away a tenant past its per-tenant rate limit', async () => {
		selectQueue.push(RESTAURANT_ROW);
		rateLimitMock.mockResolvedValue(false);
		const outcome = await ingestInboundEmail(msg(), fetchAttachment());
		expect(outcome).toEqual({ kind: 'rate-limited' });
		expect(createBatchMock).not.toHaveBeenCalled();
	});

	it('applies the plan quota gate exactly as web upload does', async () => {
		selectQueue.push(RESTAURANT_ROW);
		remainingQuotaMock.mockResolvedValue(0);
		const outcome = await ingestInboundEmail(msg(), fetchAttachment());
		expect(outcome).toEqual({ kind: 'quota-exceeded' });
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(remainingQuotaMock).toHaveBeenCalledWith('rest-1', null);
	});
});

describe('ingestInboundEmail — attachment validation (issue #236)', () => {
	it('rejects an unsupported extension and sends the sender a rejection email instead of silently dropping it', async () => {
		selectQueue.push(RESTAURANT_ROW);
		const outcome = await ingestInboundEmail(
			msg({ attachments: [{ id: 'att-1', filename: 'script.exe', contentType: 'application/octet-stream', contentDisposition: null }] }),
			fetchAttachment(Buffer.from('MZ not a real invoice')),
		);
		expect(outcome).toMatchObject({ kind: 'no-valid-attachments' });
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'proveedor@example.com' }));
	});

	it('rejects a file whose bytes do not match its declared extension', async () => {
		selectQueue.push(RESTAURANT_ROW);
		const outcome = await ingestInboundEmail(msg(), fetchAttachment(padToMinSize([0x00, 0x01, 0x02])));
		expect(outcome).toMatchObject({ kind: 'no-valid-attachments', rejected: [expect.objectContaining({ reason: 'contentMismatch' })] });
		expect(createBatchMock).not.toHaveBeenCalled();
	});

	it('rejects an oversized attachment, same cap as web upload', async () => {
		selectQueue.push(RESTAURANT_ROW);
		const big = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), Buffer.alloc(MAX_FILE_BYTES)]);
		const outcome = await ingestInboundEmail(msg(), fetchAttachment(big));
		expect(outcome).toMatchObject({ kind: 'no-valid-attachments', rejected: [expect.objectContaining({ reason: 'tooLarge' })] });
	});

	it('turns a size rejection from the fetch layer into the same rejected-attachment outcome, not a 500 (issue #236 follow-up)', async () => {
		selectQueue.push(RESTAURANT_ROW);
		const deps = { fetchAttachment: vi.fn().mockRejectedValue(new MediaTooLargeError(MAX_FILE_BYTES + 1)) };
		const outcome = await ingestInboundEmail(msg(), deps);
		expect(outcome).toEqual({
			kind: 'no-valid-attachments',
			rejected: [{ name: 'factura.pdf', reason: 'tooLarge' }],
		});
		expect(createBatchMock).not.toHaveBeenCalled();
		expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'proveedor@example.com' }));
		expect(releaseMock).not.toHaveBeenCalled();
	});

	it('accepts a well-formed PDF', async () => {
		selectQueue.push(RESTAURANT_ROW);
		const outcome = await ingestInboundEmail(msg(), fetchAttachment());
		expect(outcome.kind).toBe('ingested');
	});
});

describe('idempotency claim release (mirrors ADR-004\'s WhatsApp bridge, issue #483 pattern)', () => {
	it('releases the claim on an unexpected failure so a genuine retry is reprocessed', async () => {
		selectQueue.push(RESTAURANT_ROW);
		createBatchMock.mockRejectedValueOnce(new Error('deadlock detected'));
		await expect(ingestInboundEmail(msg(), fetchAttachment())).rejects.toThrow('deadlock detected');
		expect(releaseMock).toHaveBeenCalledWith('email-ingest', 'email-1');
	});

	it('keeps the claim once the batch and extraction enqueue have committed', async () => {
		selectQueue.push(RESTAURANT_ROW);
		await ingestInboundEmail(msg(), fetchAttachment());
		expect(releaseMock).not.toHaveBeenCalled();
	});
});

/**
 * Issue #236 follow-up (round 2): fetchResendAttachment used to buffer the
 * whole download before anything checked its size, so a single large
 * attachment on this synchronous, sender-triggerable webhook path could
 * spike the web service's memory. It must now reject on a declared
 * Content-Length over the cap without reading the body at all, and — since
 * Content-Length can be absent or lie — cap what it actually reads and abort
 * mid-stream, using the same MAX_FILE_BYTES saveUploadedFiles enforces.
 */
describe('fetchResendAttachment — size guard', () => {
	function resendClient() {
		return {
			emails: {
				receiving: {
					attachments: {
						get: vi.fn().mockResolvedValue({ data: { download_url: 'https://files.resend.dev/att-1' }, error: null }),
					},
				},
			},
		};
	}

	beforeEach(() => {
		getResendClientMock.mockReturnValue(resendClient());
	});

	it('rejects a declared-oversize download without ever reading the body', async () => {
		const getReader = vi.fn();
		const arrayBuffer = vi.fn();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			headers: { get: (name: string) => (name === 'content-length' ? String(MAX_FILE_BYTES + 1) : null) },
			body: { getReader },
			arrayBuffer,
		}));

		await expect(fetchResendAttachment('email-1', 'att-1')).rejects.toThrow(/over the/);
		expect(getReader).not.toHaveBeenCalled();
		expect(arrayBuffer).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('caps what it reads and aborts mid-stream when Content-Length is absent (or lies)', async () => {
		const chunkSize = Math.ceil(MAX_FILE_BYTES / 2) + 1000;
		const chunks = [Buffer.alloc(chunkSize, 1), Buffer.alloc(chunkSize, 2), Buffer.alloc(chunkSize, 3)];
		let i = 0;
		const read = vi.fn(async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }));
		const cancel = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			headers: { get: () => null },
			body: { getReader: () => ({ read, cancel }) },
		}));

		await expect(fetchResendAttachment('email-1', 'att-1')).rejects.toThrow(/over the/);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(read).toHaveBeenCalledTimes(2);
		vi.unstubAllGlobals();
	});

	it('accepts a download within the limit', async () => {
		const bytes = Buffer.from('%PDF-1.7');
		let done = false;
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			headers: { get: () => String(bytes.length) },
			body: { getReader: () => ({ read: async () => (done ? { done: true, value: undefined } : ((done = true), { done: false, value: bytes })), cancel: vi.fn() }) },
		}));

		await expect(fetchResendAttachment('email-1', 'att-1')).resolves.toEqual(bytes);
		vi.unstubAllGlobals();
	});
});
