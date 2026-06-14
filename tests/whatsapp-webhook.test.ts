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

const { handleMock } = vi.hoisted(() => ({
	handleMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/server/env', () => ({ WHATSAPP_VERIFY_TOKEN: 'verify-me' }));
vi.mock('$lib/server/whatsapp-bot', () => ({ handleWhatsAppMessage: handleMock }));

import { GET, POST } from '../src/routes/api/whatsapp/webhook/+server';

// Minimal shims for the bits of the SvelteKit RequestEvent the handlers touch.
function getEvent(qs: string) {
	return { url: new URL(`http://localhost/api/whatsapp/webhook?${qs}`) } as never;
}
function postEvent(body: unknown, opts: { invalidJson?: boolean } = {}) {
	return {
		request: {
			json: async () => {
				if (opts.invalidJson) throw new SyntaxError('bad json');
				return body;
			},
		},
	} as never;
}

beforeEach(() => {
	handleMock.mockClear();
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
