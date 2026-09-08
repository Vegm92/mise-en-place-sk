/**
 * /waitlist load + join action — attribution wiring (issue #326).
 *
 * `load` parses attribution off the request URL/referer and sets the
 * first-party `mep_attr` cookie so it survives the /waitlist -> /signup hop;
 * `join` reads that same cookie (not the POST's own query string, which a
 * SvelteKit form action like `action="?/join"` replaces) and persists it
 * onto the waitlist row. insertWaitlistEmail, countWaitlistEmails and
 * trackAnonymousEvent are mocked so this is a pure wiring test, not a
 * DB-backed one — see tests/waitlist-attribution.test.ts for the real-row
 * persistence proof and tests/attribution.test.ts for the parser itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/waitlist-db', async () => (await import('./helpers/waitlist-route-mocks')).waitlistDbMock);
vi.mock('$lib/server/events', async () => (await import('./helpers/waitlist-route-mocks')).eventsMock);
vi.mock('$lib/server/rate-limiter', async () => (await import('./helpers/waitlist-route-mocks')).rateLimiterMock);

import { load, actions } from '../src/routes/waitlist/+page.server';
import {
	insertWaitlistEmailMock,
	countWaitlistEmailsMock,
	trackAnonymousEventMock,
	resetWaitlistRouteMocks,
	fakeCookies,
	joinEvent,
} from './helpers/waitlist-route-mocks';

function loadEvent(urlStr: string, opts: { referer?: string; cookies?: ReturnType<typeof fakeCookies> } = {}) {
	return {
		url: new URL(urlStr),
		request: { headers: new Headers(opts.referer ? { referer: opts.referer } : {}) },
		cookies: opts.cookies ?? fakeCookies(),
	} as never;
}

const EXISTING_ATTR = JSON.stringify({
	source: 'google', campaign: 'spring', variant: null, segment: null,
	referrer: null, landingPath: '/waitlist', referredBy: null,
});

beforeEach(resetWaitlistRouteMocks);

describe('/waitlist load — sets the mep_attr cookie', () => {
	it('sets mep_attr with source + campaign from utm_source / utm_campaign', async () => {
		const cookies = fakeCookies();
		await load(loadEvent('https://mise-place.com/waitlist?utm_source=x&utm_campaign=y', { cookies }));

		expect(cookies.set).toHaveBeenCalledOnce();
		const [name, value, opts] = cookies.set.mock.calls[0]!;
		expect(name).toBe('mep_attr');
		expect(JSON.parse(value)).toMatchObject({ source: 'x', campaign: 'y', landingPath: '/waitlist' });
		expect(opts).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax' });
	});

	it('still sets a baseline cookie on a first, UTM-less visit', async () => {
		const cookies = fakeCookies();
		await load(loadEvent('https://mise-place.com/waitlist', { cookies }));
		expect(cookies.set).toHaveBeenCalledOnce();
	});

	it('does not clobber an existing meaningful-attribution cookie with a bare revisit', async () => {
		const cookies = fakeCookies({ mep_attr: EXISTING_ATTR });
		await load(loadEvent('https://mise-place.com/waitlist', { cookies }));
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('writes nothing on a campaign visit from a jar that has not consented (art. 22.2 LSSI)', async () => {
		const cookies = fakeCookies({}, 'unset');
		await load(loadEvent('https://mise-place.com/waitlist?utm_source=x&utm_campaign=y', { cookies }));
		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies._store.mep_attr).toBeUndefined();
	});

	it('clears a pre-existing attribution cookie once the visitor declines', async () => {
		const cookies = fakeCookies({ mep_attr: EXISTING_ATTR }, 'denied');
		await load(loadEvent('https://mise-place.com/waitlist?utm_source=x', { cookies }));
		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).toHaveBeenCalledWith('mep_attr', { path: '/' });
	});

	it('does overwrite an existing cookie when the new visit carries its own signal', async () => {
		const cookies = fakeCookies({ mep_attr: EXISTING_ATTR });
		await load(loadEvent('https://mise-place.com/waitlist?utm_source=facebook', { cookies }));
		expect(cookies.set).toHaveBeenCalledOnce();
		const value = cookies.set.mock.calls[0]![1];
		expect(JSON.parse(value)).toMatchObject({ source: 'facebook' });
	});
});

describe('/waitlist join action — persists attribution from the cookie', () => {
	it('passes the cookie-derived attribution to insertWaitlistEmail', async () => {
		const cookieValue = JSON.stringify({
			source: 'google', campaign: 'spring_launch', variant: 'b', segment: 'chefs',
			referrer: 'https://google.com/search', landingPath: '/waitlist', referredBy: 'ABC123',
		});
		const cookies = fakeCookies({ mep_attr: cookieValue });

		const result = await actions.join!(joinEvent('chef@example.com', cookies));

		expect(result).toEqual({ success: true });
		expect(insertWaitlistEmailMock).toHaveBeenCalledWith(
			'chef@example.com',
			expect.objectContaining({ source: 'google', campaign: 'spring_launch', referredBy: 'ABC123' }),
		);
	});

	it('passes empty attribution when there is no cookie', async () => {
		const cookies = fakeCookies();
		await actions.join!(joinEvent('chef@example.com', cookies));
		expect(insertWaitlistEmailMock).toHaveBeenCalledWith(
			'chef@example.com',
			expect.objectContaining({ source: null, campaign: null }),
		);
	});

	it('tracks an anonymous waitlist_joined funnel event on a real join', async () => {
		const cookies = fakeCookies({
			mep_attr: JSON.stringify({
				source: 'google', campaign: 'y', variant: null, segment: null,
				referrer: null, landingPath: '/waitlist', referredBy: null,
			}),
		});
		await actions.join!(joinEvent('chef@example.com', cookies));
		expect(trackAnonymousEventMock).toHaveBeenCalledWith(
			'waitlist_joined',
			expect.objectContaining({ source: 'google', campaign: 'y' }),
		);
	});

	it('does not track a funnel event for an already-registered email', async () => {
		insertWaitlistEmailMock.mockResolvedValueOnce(false);
		const cookies = fakeCookies();
		const result = await actions.join!(joinEvent('chef@example.com', cookies));
		expect(result).toEqual({ success: true, alreadyRegistered: true });
		expect(trackAnonymousEventMock).not.toHaveBeenCalled();
	});
});
