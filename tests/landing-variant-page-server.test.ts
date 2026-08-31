/**
 * /l/[variant] load + join action — issue #327.
 *
 * Mirrors tests/waitlist-page-server.test.ts (issue #326) for the per-niche
 * landing routes: `load` resolves the slug against the variant registry
 * (404 on an unknown one), captures attribution the same way /waitlist does
 * but with the slug stamped in as `variant` (overriding any `?variant=`
 * query param the URL itself might carry, per the issue's instruction that
 * the route's own slug is the authoritative signal), and `join` reuses the
 * exact same shared action as /waitlist so a join from a landing page
 * behaves identically once it reaches the DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/waitlist-db', async () => (await import('./helpers/waitlist-route-mocks')).waitlistDbMock);
vi.mock('$lib/server/events', async () => (await import('./helpers/waitlist-route-mocks')).eventsMock);
vi.mock('$lib/server/rate-limiter', async () => (await import('./helpers/waitlist-route-mocks')).rateLimiterMock);

import { load, actions } from '../src/routes/l/[variant]/+page.server';
import {
	insertWaitlistEmailMock,
	countWaitlistEmailsMock,
	trackAnonymousEventMock,
	resetWaitlistRouteMocks,
	fakeCookies,
	joinEvent,
} from './helpers/waitlist-route-mocks';
import { joinWaitlistAction } from '../src/lib/server/waitlist-join-action';

function loadEvent(slug: string, urlStr: string, opts: { referer?: string; cookies?: ReturnType<typeof fakeCookies> } = {}) {
	return {
		params: { variant: slug },
		url: new URL(urlStr),
		request: { headers: new Headers(opts.referer ? { referer: opts.referer } : {}) },
		cookies: opts.cookies ?? fakeCookies(),
	} as never;
}

beforeEach(resetWaitlistRouteMocks);

describe('/l/[variant] load — variant resolution', () => {
	it('resolves a known slug and returns its overrides', async () => {
		const data = await load(loadEvent('menu-del-dia', 'https://mise-place.com/l/menu-del-dia')) as {
			canonicalUrl: string;
			overrides: { es: Record<string, string> };
		};
		expect(data.canonicalUrl).toBe('https://mise-place.com/l/menu-del-dia');
		expect(data.overrides.es['waitlist.headline']).toBe('Tu menú vale 13 €. Tu aceite ya no.');
	});

	it('404s on an unknown slug', async () => {
		await expect(load(loadEvent('not-a-real-variant', 'https://mise-place.com/l/not-a-real-variant')))
			.rejects.toMatchObject({ status: 404 });
	});

	it('uses the literal "Not Found" message so +error.svelte routes it through i18n (issue #747)', async () => {
		try {
			await load(loadEvent('not-a-real-variant', 'https://mise-place.com/l/not-a-real-variant'));
			expect.unreachable();
		} catch (e) {
			expect((e as { body?: { message?: string } }).body?.message).toBe('Not Found');
		}
	});
});

describe('/l/[variant] load — sets the mep_attr cookie with the slug as variant', () => {
	it('stamps the slug into the cookie even with no query params', async () => {
		const cookies = fakeCookies();
		await load(loadEvent('menu-del-dia', 'https://mise-place.com/l/menu-del-dia', { cookies }));

		expect(cookies.set).toHaveBeenCalledOnce();
		const [name, value] = cookies.set.mock.calls[0];
		expect(name).toBe('mep_attr');
		expect(JSON.parse(value)).toMatchObject({ variant: 'menu-del-dia' });
	});

	it('the route slug wins over a ?variant= query param on the same request', async () => {
		const cookies = fakeCookies();
		await load(loadEvent('menu-del-dia', 'https://mise-place.com/l/menu-del-dia?variant=spoofed', { cookies }));
		const value = cookies.set.mock.calls[0][1];
		expect(JSON.parse(value)).toMatchObject({ variant: 'menu-del-dia' });
	});

	it('still captures utm_source/campaign alongside the variant slug', async () => {
		const cookies = fakeCookies();
		await load(loadEvent(
			'aceite-de-oliva',
			'https://mise-place.com/l/aceite-de-oliva?utm_source=ig&utm_campaign=launch',
			{ cookies },
		));
		const value = cookies.set.mock.calls[0][1];
		expect(JSON.parse(value)).toMatchObject({ variant: 'aceite-de-oliva', source: 'ig', campaign: 'launch' });
	});

	it('a landing-page visit always carries signal, so it overwrites a prior bare cookie', async () => {
		const bare = JSON.stringify({
			source: null, campaign: null, variant: null, segment: null,
			referrer: null, landingPath: '/waitlist', referredBy: null,
		});
		const cookies = fakeCookies({ mep_attr: bare });
		await load(loadEvent('pescado-fresco', 'https://mise-place.com/l/pescado-fresco', { cookies }));
		expect(cookies.set).toHaveBeenCalledOnce();
		expect(JSON.parse(cookies.set.mock.calls[0][1])).toMatchObject({ variant: 'pescado-fresco' });
	});
});

describe('/l/[variant] join action — reuses the shared waitlist join action', () => {
	it('is literally the same action function as /waitlist uses', () => {
		expect(actions.join).toBe(joinWaitlistAction);
	});

	it('persists the variant slug on the waitlist row when joining from a landing page', async () => {
		const cookies = fakeCookies({
			mep_attr: JSON.stringify({
				source: null, campaign: null, variant: 'grupo-multi-local', segment: null,
				referrer: null, landingPath: '/l/grupo-multi-local', referredBy: null,
			}),
		});
		const result = await actions.join(joinEvent('chef@example.com', cookies));
		expect(result).toEqual({ success: true });
		expect(insertWaitlistEmailMock).toHaveBeenCalledWith(
			'chef@example.com',
			expect.objectContaining({ variant: 'grupo-multi-local' }),
		);
		expect(trackAnonymousEventMock).toHaveBeenCalledWith(
			'waitlist_joined',
			expect.objectContaining({ variant: 'grupo-multi-local' }),
		);
	});
});
