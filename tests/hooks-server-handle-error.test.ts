/**
 * hooks.server.ts `handleError` (production Sentry noise, 2026-08-29) — a stale
 * client/bot probing a nonexistent path (e.g. /waitlist/theme-init.js) throws
 * SvelteKit's internal `SvelteKitError`, not the `HttpError` created by the
 * `error()` helper. The handler used to gate logging on `isHttpError(error)`,
 * which never matches `SvelteKitError`, so every such 404 probe logged a full
 * stack trace via console.error. SvelteKit passes a numeric `status` alongside
 * `error` to both `HttpError` and `SvelteKitError` cases; gating on that
 * instead covers both shapes. The installed `@sentry/sveltekit` wrapper itself
 * already skips `captureException` for any input with `status` in 400-499
 * before this callback ever runs, so a dropped 4xx here is also never shipped
 * to Sentry.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const fakeEvent = { route: { id: null }, url: new URL('https://example.com/waitlist/theme-init.js') } as unknown as RequestEvent;

class SvelteKitError extends Error {
	status: number;
	text: string;
	constructor(status: number, text: string, message: string) {
		super(message);
		this.status = status;
		this.text = text;
	}
}

class HttpError {
	status: number;
	body: { message: string };
	constructor(status: number, message: string) {
		this.status = status;
		this.body = { message };
	}
}

describe('hooks.server.ts handleError', () => {
	let handleError: (input: { error: unknown; event: RequestEvent; status: number; message: string }) => unknown;

	beforeAll(async () => {
		({ handleError } = await import('../src/hooks.server'));
	});

	it('drops a 404 SvelteKitError (unmatched route/static asset) without logging', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = new SvelteKitError(404, 'Not Found', 'Not found: /waitlist/theme-init.js');

		await handleError({ error, event: fakeEvent, status: 404, message: 'Not Found' });

		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it('drops a 4xx HttpError the same way', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = new HttpError(403, 'Forbidden');

		await handleError({ error, event: fakeEvent, status: 403, message: 'Forbidden' });

		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it('still logs a 500 error', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = new Error('boom');

		await handleError({ error, event: fakeEvent, status: 500, message: 'Internal Error' });

		expect(spy).toHaveBeenCalledWith('[server error]', error);
		spy.mockRestore();
	});
});
