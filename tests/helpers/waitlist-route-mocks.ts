/**
 * Shared mock kit for the waitlist-route wiring tests
 * (tests/waitlist-page-server.test.ts and
 * tests/landing-variant-page-server.test.ts): both routes register the same
 * join action against the same mocked seams, so the mock instances, the
 * module-mock factories, the cookie/join event fakes and the reset live here
 * once. Consume the module mocks from a `vi.mock` async factory, e.g.
 * vi.mock('$lib/server/events', async () =>
 *   (await import('./helpers/waitlist-route-mocks')).eventsMock);
 */
import { vi } from 'vitest';

export const insertWaitlistEmailMock = vi.fn().mockResolvedValue(true);
export const countWaitlistEmailsMock = vi.fn().mockResolvedValue(0);
export const trackAnonymousEventMock = vi.fn();

export const waitlistDbMock = {
	insertWaitlistEmail: insertWaitlistEmailMock,
	countWaitlistEmails: countWaitlistEmailsMock,
};
export const eventsMock = { trackAnonymousEvent: trackAnonymousEventMock };
export const rateLimiterMock = { checkRateLimit: vi.fn().mockResolvedValue(true) };

export function resetWaitlistRouteMocks() {
	insertWaitlistEmailMock.mockClear().mockResolvedValue(true);
	countWaitlistEmailsMock.mockClear().mockResolvedValue(0);
	trackAnonymousEventMock.mockClear();
}

export function fakeCookies(initial: Record<string, string> = {}) {
	const store = { ...initial };
	return {
		get: vi.fn((name: string) => store[name]),
		set: vi.fn((name: string, value: string, _opts?: Record<string, unknown>) => { store[name] = value; }),
		_store: store,
	};
}

export function joinEvent(email: string, cookies: ReturnType<typeof fakeCookies>) {
	const form = new FormData();
	form.append('email', email);
	return {
		request: { formData: async () => form },
		getClientAddress: () => '203.0.113.9',
		cookies,
	} as never;
}
