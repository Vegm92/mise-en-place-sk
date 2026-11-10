/**
 * WhatsApp Cloud API client — Graph API versioning and auth.
 *
 * Meta expires each Graph API version roughly two years after release and calls
 * to an expired one fail outright, which takes the whole bot down silently
 * (sends throw). The version therefore must come from env
 * rather than a literal in the source — these tests pin that, so a future edit
 * can't quietly hardcode a version that will rot again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/server/env', () => ({
	WHATSAPP_ACCESS_TOKEN: 'test-token',
	WHATSAPP_PHONE_NUMBER_ID: '123456',
	WHATSAPP_API_VERSION: 'v25.0',
}));

const fetchMock = vi.fn();

async function setupWhatsAppSend() {
	fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
	const { sendWhatsAppMessage } = await import('../src/lib/server/whatsapp');
	await sendWhatsAppMessage('34612345678', 'hola');
}

beforeEach(() => {
	vi.resetModules();
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('sendWhatsAppMessage', () => {
	it('posts to the configured Graph API version, not a hardcoded one', async () => {
		await setupWhatsAppSend();

		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://graph.facebook.com/v25.0/123456/messages');
		expect(init.headers.Authorization).toBe('Bearer test-token');
		expect(JSON.parse(init.body)).toEqual({
			messaging_product: 'whatsapp',
			to: '34612345678',
			type: 'text',
			text: { body: 'hola' },
		});
	});

	it('never targets an expired Graph API version', async () => {
		await setupWhatsAppSend();

		// v19.0 expired in 2026; anything at or below it is dead on arrival.
		const url = String(fetchMock.mock.calls[0]![0]);
		const version = Number(url.match(/graph\.facebook\.com\/v(\d+)\./)?.[1]);
		expect(version).toBeGreaterThan(19);
	});

	it('surfaces an API error instead of failing silently', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Unsupported version' });
		const { sendWhatsAppMessage } = await import('../src/lib/server/whatsapp');

		await expect(sendWhatsAppMessage('34612345678', 'hola')).rejects.toThrow(/400/);
	});
});
