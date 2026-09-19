/**
 * Inbound email webhook route (issue #236).
 *
 * Verifies the Resend/svix-style signature, parses the `email.received`
 * envelope, and hands the parsed message to ingestInboundEmail (mocked here
 * — its own behaviour is pinned in email-ingest.test.ts). An unauthenticated
 * inbound endpoint accepting file attachments would be worse than the hole
 * this feature fixes, so signature rejection gets its own describe block
 * with a real HMAC, not a stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

const { ingestMock } = vi.hoisted(() => ({
	ingestMock: vi.fn().mockResolvedValue({ kind: 'ingested', restaurantId: 'rest-1', batchId: 'batch-1' }),
}));

// RESEND_WEBHOOK_SECRET is intentionally empty here: with no secret the route
// skips signature verification (dev behaviour), so these tests isolate the
// route plumbing. Signature rejection is covered separately below.
vi.mock('$lib/server/env', () => ({ RESEND_WEBHOOK_SECRET: '' }));
vi.mock('$lib/server/email-ingest', () => ({
	ingestInboundEmail: ingestMock,
	fetchResendAttachment: vi.fn(),
}));

import { POST } from '../src/routes/api/email-ingest/webhook/+server';

function postEvent(body: unknown, opts: { invalidJson?: boolean; headers?: Record<string, string> } = {}) {
	const raw = opts.invalidJson ? '{ not valid json' : JSON.stringify(body);
	const headers = opts.headers ?? {};
	return {
		request: {
			text: async () => raw,
			headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
		},
		locals: { requestId: 'req-webhook-1' },
	} as never;
}

function envelope(data: Record<string, unknown>) {
	return { type: 'email.received', data };
}

const VALID_DATA = {
	email_id: 'em_1',
	from: 'proveedor@example.com',
	to: ['tok-abc@ingest.example.com'],
	attachments: [{ id: 'att-1', filename: 'factura.pdf', content_type: 'application/pdf', content_disposition: null }],
};

beforeEach(() => {
	ingestMock.mockClear();
	ingestMock.mockResolvedValue({ kind: 'ingested', restaurantId: 'rest-1', batchId: 'batch-1' });
});

describe('POST — envelope parsing and hand-off', () => {
	it('parses email.received and hands the message + correlation id to ingestInboundEmail', async () => {
		const res = await POST(postEvent(envelope(VALID_DATA)));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, outcome: 'ingested' });
		expect(ingestMock).toHaveBeenCalledWith(
			{
				emailId: 'em_1',
				from: 'proveedor@example.com',
				to: ['tok-abc@ingest.example.com'],
				attachments: [{ id: 'att-1', filename: 'factura.pdf', contentType: 'application/pdf', contentDisposition: null }],
			},
			expect.objectContaining({ fetchAttachment: expect.any(Function) }),
			'req-webhook-1',
		);
	});

	it('ignores an event type it does not handle, without calling ingestInboundEmail', async () => {
		const res = await POST(postEvent({ type: 'email.delivered', data: VALID_DATA }));
		expect(await res.json()).toEqual({ ok: true, ignored: true });
		expect(ingestMock).not.toHaveBeenCalled();
	});

	it('returns 400 on invalid JSON', async () => {
		const res = await POST(postEvent(null, { invalidJson: true }));
		expect(res.status).toBe(400);
		expect(ingestMock).not.toHaveBeenCalled();
	});

	it('tolerates a malformed envelope without throwing', async () => {
		const res = await POST(postEvent({ type: 'email.received', data: { from: 'x' } }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, ignored: true });
		expect(ingestMock).not.toHaveBeenCalled();
	});

	it('maps an unknown-recipient outcome to a rejecting status', async () => {
		ingestMock.mockResolvedValue({ kind: 'unknown-recipient' });
		const res = await POST(postEvent(envelope(VALID_DATA)));
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ ok: false, outcome: 'unknown-recipient' });
	});

	it('acknowledges a handled-but-not-ingested outcome with 200', async () => {
		ingestMock.mockResolvedValue({ kind: 'no-valid-attachments', rejected: [] });
		const res = await POST(postEvent(envelope(VALID_DATA)));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: false, outcome: 'no-valid-attachments' });
	});

	it('surfaces an unexpected pipeline failure as a 500 instead of a silent 200', async () => {
		ingestMock.mockRejectedValueOnce(new Error('db unreachable'));
		const res = await POST(postEvent(envelope(VALID_DATA)));
		expect(res.status).toBe(500);
	});
});

describe('POST — signature verification (issue #236)', () => {
	const SECRET = 'whsec_c2VjcmV0LWJ5dGVzLWZvci10ZXN0aW5n';

	function sign(id: string, timestamp: string, body: string): string {
		const secretBytes = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
		const sig = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
		return `v1,${sig}`;
	}

	async function signedPost() {
		vi.resetModules();
		vi.doMock('$lib/server/env', () => ({ RESEND_WEBHOOK_SECRET: SECRET }));
		vi.doMock('$lib/server/email-ingest', () => ({ ingestInboundEmail: ingestMock, fetchResendAttachment: vi.fn() }));
		return (await import('../src/routes/api/email-ingest/webhook/+server')).POST;
	}

	it('accepts a correctly signed request', async () => {
		const SignedPOST = await signedPost();
		const body = JSON.stringify(envelope(VALID_DATA));
		const id = 'msg_1';
		const timestamp = String(Math.floor(Date.now() / 1000));
		const res = await SignedPOST(postEvent(envelope(VALID_DATA), {
			headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': sign(id, timestamp, body) },
		}));
		expect(res.status).toBe(200);
		expect(ingestMock).toHaveBeenCalled();
		vi.doUnmock('$lib/server/env');
		vi.doUnmock('$lib/server/email-ingest');
	});

	it('rejects a request with no signature headers when a secret is configured', async () => {
		const SignedPOST = await signedPost();
		const res = await SignedPOST(postEvent(envelope(VALID_DATA)));
		expect(res.status).toBe(401);
		expect(ingestMock).not.toHaveBeenCalled();
		vi.doUnmock('$lib/server/env');
		vi.doUnmock('$lib/server/email-ingest');
	});

	it('rejects a wrong signature', async () => {
		const SignedPOST = await signedPost();
		const timestamp = String(Math.floor(Date.now() / 1000));
		const res = await SignedPOST(postEvent(envelope(VALID_DATA), {
			headers: { 'svix-id': 'msg_1', 'svix-timestamp': timestamp, 'svix-signature': 'v1,deadbeef==' },
		}));
		expect(res.status).toBe(401);
		expect(ingestMock).not.toHaveBeenCalled();
		vi.doUnmock('$lib/server/env');
		vi.doUnmock('$lib/server/email-ingest');
	});

	it('rejects a stale timestamp outside the replay tolerance window', async () => {
		const SignedPOST = await signedPost();
		const body = JSON.stringify(envelope(VALID_DATA));
		const id = 'msg_1';
		const oldTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
		const res = await SignedPOST(postEvent(envelope(VALID_DATA), {
			headers: { 'svix-id': id, 'svix-timestamp': oldTimestamp, 'svix-signature': sign(id, oldTimestamp, body) },
		}));
		expect(res.status).toBe(401);
		vi.doUnmock('$lib/server/env');
		vi.doUnmock('$lib/server/email-ingest');
	});
});
