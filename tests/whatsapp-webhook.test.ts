/**
 * WhatsApp Cloud API webhook route (feat #108).
 *
 * GET  — Meta's verify-token handshake: the challenge is echoed only when the
 *        token matches, otherwise 403. A regression here either breaks setup or
 *        lets anyone register a webhook.
 * POST — parses Meta's nested entry/changes/value/messages envelope and fans each
 *        message out to the bot handler, always answering 200 fast.
 *
 * The bot handler and env token are mocked so this isolates the route plumbing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { handleMock, accountEventMock } = vi.hoisted(() => ({
	handleMock: vi.fn().mockResolvedValue(undefined),
	accountEventMock: vi.fn().mockResolvedValue(undefined),
}));

// WHATSAPP_APP_SECRET is intentionally empty here: with no secret the route
// skips HMAC verification (dev behaviour), so these tests isolate the route
// plumbing. Signature rejection is covered separately below.
vi.mock('$lib/server/env', () => ({ WHATSAPP_VERIFY_TOKEN: 'verify-me', WHATSAPP_APP_SECRET: '' }));
vi.mock('$lib/server/whatsapp-bot', () => ({ handleWhatsAppMessage: handleMock }));
vi.mock('$lib/server/whatsapp-health', () => ({ recordAccountEvent: accountEventMock }));

import { GET, POST } from '../src/routes/api/whatsapp/webhook/+server';

// Minimal shims for the bits of the SvelteKit RequestEvent the handlers touch.
function getEvent(qs: string) {
	return { url: new URL(`http://localhost/api/whatsapp/webhook?${qs}`) } as never;
}
function postEvent(body: unknown, opts: { invalidJson?: boolean; signature?: string } = {}) {
	const raw = opts.invalidJson ? '{ not valid json' : JSON.stringify(body);
	return {
		request: {
			text: async () => raw,
			headers: { get: (name: string) => (name.toLowerCase() === 'x-hub-signature-256' ? (opts.signature ?? null) : null) },
		},
	} as never;
}

beforeEach(() => {
	handleMock.mockClear();
	accountEventMock.mockClear();
});

describe('GET — verify-token handshake', () => {
	it('echoes the challenge when mode + token match', async () => {
		const res = await GET(getEvent('hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42'));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('42');
	});

	it('rejects a wrong verify token with 403', async () => {
		const res = await GET(getEvent('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42'));
		expect(res.status).toBe(403);
	});

	it('rejects when mode is not subscribe', async () => {
		const res = await GET(getEvent('hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=42'));
		expect(res.status).toBe(403);
	});
});

describe('POST — message fan-out', () => {
	function payload(...messages: object[]) {
		return {
			entry: [
				{ changes: [{ value: { messaging_product: 'whatsapp', messages } }] },
			],
		};
	}

	it('dispatches every message in the envelope to the bot handler', async () => {
		const res = await POST(
			postEvent(
				payload(
					{ from: '+34600000001', id: 'wamid.1', type: 'text', text: { body: 'hola' } },
					{ from: '+34600000002', id: 'wamid.2', type: 'image', image: { id: 'media-1' } },
				),
			),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(handleMock).toHaveBeenCalledTimes(2);
		expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'wamid.1', type: 'text' }));
		expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'wamid.2', type: 'image' }));
	});

	it('returns 200 and dispatches nothing for a status-only callback (no messages)', async () => {
		const res = await POST(postEvent({ entry: [{ changes: [{ value: { statuses: [{ id: 'x' }] } }] }] }));
		expect(res.status).toBe(200);
		expect(handleMock).not.toHaveBeenCalled();
	});

	it('tolerates a malformed envelope without throwing', async () => {
		const res = await POST(postEvent({ not: 'what we expect' }));
		expect(res.status).toBe(200);
		expect(handleMock).not.toHaveBeenCalled();
	});

	it('returns 400 on invalid JSON', async () => {
		const res = await POST(postEvent(null, { invalidJson: true }));
		expect(res.status).toBe(400);
		expect(handleMock).not.toHaveBeenCalled();
	});

	it('swallows downstream handler errors (fire-and-forget, still 200)', async () => {
		handleMock.mockRejectedValueOnce(new Error('boom'));
		const res = await POST(
			postEvent(payload({ from: '+34600000003', id: 'wamid.3', type: 'text', text: { body: 'hi' } })),
		);
		expect(res.status).toBe(200);
		expect(handleMock).toHaveBeenCalledTimes(1);
	});
});

describe('POST — account-level events (issue #321)', () => {
	function accountPayload(field: string, value: object) {
		return { entry: [{ changes: [{ field, value }] }] };
	}

	it('routes a quality downgrade to the health recorder, not the bot', async () => {
		const res = await POST(postEvent(accountPayload('phone_number_quality_update', {
			display_phone_number: '34612345678', event: 'FLAGGED', current_limit: 'TIER_1K',
		})));
		expect(res.status).toBe(200);
		expect(handleMock).not.toHaveBeenCalled();
		expect(accountEventMock).toHaveBeenCalledWith({
			field: 'phone_number_quality_update',
			value: expect.objectContaining({ event: 'FLAGGED' }),
		});
	});

	it('records an account restriction', async () => {
		await POST(postEvent(accountPayload('account_update', {
			event: 'ACCOUNT_RESTRICTION',
			restriction_info: [{ restriction_type: 'RESTRICTED_BIZ_INITIATED_MESSAGING' }],
		})));
		expect(accountEventMock).toHaveBeenCalledTimes(1);
	});

	it('still ignores delivery-status callbacks — they carry no health signal', async () => {
		// Statuses are the other high-volume field; recording them would bury the
		// events that matter under receipts.
		await POST(postEvent({ entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x' }] } }] }] }));
		expect(accountEventMock).not.toHaveBeenCalled();
		expect(handleMock).not.toHaveBeenCalled();
	});

	it('keeps messages and account events in the same envelope apart', async () => {
		await POST(postEvent({
			entry: [{
				changes: [
					{ field: 'messages', value: { messages: [{ from: '+34600', id: 'wamid.9', type: 'text', text: { body: 'hola' } }] } },
					{ field: 'account_update', value: { event: 'ACCOUNT_VIOLATION' } },
				],
			}],
		}));
		expect(handleMock).toHaveBeenCalledTimes(1);
		expect(accountEventMock).toHaveBeenCalledTimes(1);
	});

	it('stays 200 when the health recorder rejects', async () => {
		accountEventMock.mockRejectedValueOnce(new Error('db down'));
		const res = await POST(postEvent(accountPayload('account_update', { event: 'ACCOUNT_VIOLATION' })));
		expect(res.status).toBe(200);
	});
});

describe('POST — signature verification', () => {
	// Re-import the route against an env mock that DOES set an app secret, so the
	// HMAC path is exercised. A bad/missing signature must be rejected with 401.
	it('rejects a POST with a bad signature when the app secret is configured', async () => {
		vi.resetModules();
		vi.doMock('$lib/server/env', () => ({ WHATSAPP_VERIFY_TOKEN: 'verify-me', WHATSAPP_APP_SECRET: 'super-secret' }));
		vi.doMock('$lib/server/whatsapp-bot', () => ({ handleWhatsAppMessage: handleMock }));
		const { POST: SignedPOST } = await import('../src/routes/api/whatsapp/webhook/+server');
		const envelope = {
			entry: [{ changes: [{ value: { messaging_product: 'whatsapp', messages: [{ from: '+34600000004', id: 'wamid.4', type: 'text', text: { body: 'hi' } }] } }] }],
		};
		const res = await SignedPOST(postEvent(envelope, { signature: 'sha256=deadbeef' }));
		expect(res.status).toBe(401);
		expect(handleMock).not.toHaveBeenCalled();
		vi.doUnmock('$lib/server/env');
		vi.doUnmock('$lib/server/whatsapp-bot');
	});
});
