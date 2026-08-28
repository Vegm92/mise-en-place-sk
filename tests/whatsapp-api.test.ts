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
import { MAX_FILE_BYTES } from '../src/lib/server/file-validation';

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
			.mockResolvedValueOnce({
				ok: true,
				headers: new Headers(),
				arrayBuffer: async () => new TextEncoder().encode('pdf').buffer,
			});

		const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');
		const result = await downloadWhatsAppMedia('media-1');

		expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v25.0/media-1');
		// The CDN URL is short-lived and still requires the bearer token.
		expect(fetchMock.mock.calls[1][0]).toBe('https://lookaside.fbsbx.com/abc');
		expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer test-token');
		expect(result.mimeType).toBe('application/pdf');
		expect(result.extension).toBe('pdf');
	});

	it('falls back to a jpg extension for a genuinely unmapped mime type', async () => {
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'image/webp' }),
			})
			.mockResolvedValueOnce({ ok: true, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(1) });

		const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');
		expect((await downloadWhatsAppMedia('media-2')).extension).toBe('jpg');
	});

	// Issue #484: image/heic used to fall through the "unmapped mime type"
	// default above and get saved as a .jpg — a file the extraction pipeline
	// then handed to Gemini as image/jpeg, which cannot decode HEIC bytes.
	// It now maps to its own extension so the allow-list check downstream
	// (file-validation.ts) rejects it honestly instead of mislabelling it.
	it.each(['image/heic', 'image/heif'])('maps %s to its own extension, not jpg', async (mimeType) => {
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ url: 'https://lookaside.fbsbx.com/y', mime_type: mimeType }),
			})
			.mockResolvedValueOnce({ ok: true, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(1) });

		const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');
		const result = await downloadWhatsAppMedia('media-heic');
		expect(result.extension).not.toBe('jpg');
		expect(result.extension).toBe(mimeType === 'image/heic' ? 'heic' : 'heif');
	});

	// Issue #483: the bytes were buffered unconditionally, so a 2 GB "invoice"
	// was a one-message OOM. Both the size the Graph metadata declares and the
	// one the CDN declares are checked before anything is read.
	it('rejects on the declared media size without fetching the bytes', async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				url: 'https://lookaside.fbsbx.com/big',
				mime_type: 'application/pdf',
				file_size: MAX_FILE_BYTES + 1,
			}),
		});

		const { downloadWhatsAppMedia, MediaTooLargeError } = await import('../src/lib/server/whatsapp');

		await expect(downloadWhatsAppMedia('media-3')).rejects.toBeInstanceOf(MediaTooLargeError);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('rejects on content-length without reading the body', async () => {
		const arrayBuffer = vi.fn();
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ url: 'https://lookaside.fbsbx.com/big', mime_type: 'application/pdf' }),
			})
			.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-length': String(MAX_FILE_BYTES + 1) }),
				arrayBuffer,
			});

		const { downloadWhatsAppMedia, MediaTooLargeError } = await import('../src/lib/server/whatsapp');

		await expect(downloadWhatsAppMedia('media-4')).rejects.toBeInstanceOf(MediaTooLargeError);
		expect(arrayBuffer).not.toHaveBeenCalled();
	});

	// Issue #505: the access token is a permanent WhatsApp system-user secret.
	// It must never be attached to a URL Meta's Graph response didn't actually
	// point at one of Meta's own media hosts — a redirect or a compromised/
	// unexpected `url` field should never see the Authorization header.
	describe('media URL host allowlisting', () => {
		it.each([
			['an off-host media URL', 'https://evil.example.com/steal'],
			['a lookalike host that merely contains an allowed domain', 'https://fbcdn.net.evil.example.com/x'],
			['a non-https media URL even on an allowed host', 'http://lookaside.fbsbx.com/abc'],
		])('rejects %s and never fetches it with the token', async (_label, url) => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ url, mime_type: 'application/pdf' }),
			});

			const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');

			await expect(downloadWhatsAppMedia('media-disallowed')).rejects.toThrow(/host not allowed/i);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it.each([
			'https://lookaside.fbsbx.com/abc',
			'https://scontent.fbcdn.net/v/abc.pdf',
			'https://z-p42-chatd.whatsapp.net/v/abc.pdf',
			'https://graph.facebook.com/v25.0/media-1',
		])('accepts a real Meta media host: %s', async (url) => {
			fetchMock
				.mockResolvedValueOnce({ ok: true, json: async () => ({ url, mime_type: 'application/pdf' }) })
				.mockResolvedValueOnce({
					ok: true,
					headers: new Headers(),
					arrayBuffer: async () => new TextEncoder().encode('pdf').buffer,
				});

			const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');

			const result = await downloadWhatsAppMedia('media-ok');
			expect(result.mimeType).toBe('application/pdf');
			expect(fetchMock.mock.calls[1][1].redirect).toBe('manual');
		});

		it('refuses to follow a redirect response, credentials and all', async () => {
			fetchMock
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ url: 'https://lookaside.fbsbx.com/abc', mime_type: 'application/pdf' }),
				})
				.mockResolvedValueOnce({ ok: false, status: 302, headers: new Headers() });

			const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');

			await expect(downloadWhatsAppMedia('media-redirect')).rejects.toThrow(/redirect/i);
		});

		it('rejects a missing meta.url with a clean error, not a TypeError', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ mime_type: 'application/pdf' }),
			});

			const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');

			await expect(downloadWhatsAppMedia('media-nourl')).rejects.toThrow(/did not include a url/i);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it('rejects a malformed meta.url with a clean error, not a TypeError', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ url: 'not a url', mime_type: 'application/pdf' }),
			});

			const { downloadWhatsAppMedia } = await import('../src/lib/server/whatsapp');

			await expect(downloadWhatsAppMedia('media-badurl')).rejects.toThrow(/not a valid URL/i);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});
});
