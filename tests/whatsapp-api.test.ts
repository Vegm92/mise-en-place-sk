/**
 * WhatsApp Cloud API client — Graph API versioning and auth.
 *
 * Meta expires each Graph API version roughly two years after release and calls
 * to an expired one fail outright, which takes the whole bot down silently
 * (sends throw, media downloads 400). The version therefore must come from env
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
		fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
		const { sendWhatsAppMessage } = await import('../src/lib/server/whatsapp');

		await sendWhatsAppMessage('34612345678', 'hola');

		const [url, init] = fetchMock.mock.calls[0];
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
		fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
		const { sendWhatsAppMessage } = await import('../src/lib/server/whatsapp');

		await sendWhatsAppMessage('34612345678', 'hola');

		// v19.0 expired in 2026; anything at or below it is dead on arrival.
		const url = String(fetchMock.mock.calls[0][0]);
		const version = Number(url.match(/graph\.facebook\.com\/v(\d+)\./)?.[1]);
		expect(version).toBeGreaterThan(19);
	});

	it('surfaces an API error instead of failing silently', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Unsupported version' });
		const { sendWhatsAppMessage } = await import('../src/lib/server/whatsapp');

		await expect(sendWhatsAppMessage('34612345678', 'hola')).rejects.toThrow(/400/);
	});
});

describe('downloadWhatsAppMedia', () => {
	it('resolves media metadata on the configured version, then fetches the bytes with auth', async () => {
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ url: 'https://lookaside.fbsbx.com/abc', mime_type: 'application/pdf' }),
			})
			.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new TextEncoder().encode('pdf').buffer });

		const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');
		const result = await downloadWhatsAppMedia('media-1');

		expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v25.0/media-1');
		// The CDN URL is short-lived and still requires the bearer token.
		expect(fetchMock.mock.calls[1][0]).toBe('https://lookaside.fbsbx.com/abc');
		expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer test-token');
		expect(result.mimeType).toBe('application/pdf');
		expect(result.extension).toBe('pdf');
	});

	it('falls back to a jpg extension for unmapped mime types', async () => {
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'image/heic' }),
			})
			.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });

		const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');
		expect((await downloadWhatsAppMedia('media-2')).extension).toBe('jpg');
	});
});
