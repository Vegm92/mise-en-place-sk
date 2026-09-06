/**
 * Flight-test QA pass — cookie consent gate.
 *
 * `mep_attr` records which campaign, variant and referrer a visitor arrived
 * from. That is measurement, not a cookie "strictly necessary for the service
 * the user requested", so art. 22.2 LSSI requires consent before it is
 * written — the landing pages were setting it on first load, before the
 * visitor had been asked anything.
 *
 * captureAttribution() is now gated on `mep_consent`. This file proves the
 * three states that matter: no choice yet writes nothing, a refusal writes
 * nothing and clears anything already there, and only an explicit grant lets
 * the cookie through. The consent cookie itself stores the choice and is the
 * one cookie the gate does not gate, which is what makes the choice stick.
 */
import { describe, it, expect } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { captureAttribution } from '../src/lib/server/attribution-cookie';
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '../src/lib/attribution';
import { CONSENT_COOKIE } from '../src/lib/cookie-consent';
import { readConsent, writeConsent, analyticsConsentGiven } from '../src/lib/server/cookie-consent';

type Jar = { store: Map<string, string>; deleted: string[]; cookies: Cookies };

function jar(initial: Record<string, string> = {}): Jar {
	const store = new Map(Object.entries(initial));
	const deleted: string[] = [];
	const cookies = {
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => { store.set(name, value); },
		delete: (name: string) => { store.delete(name); deleted.push(name); },
	} as unknown as Cookies;
	return { store, deleted, cookies };
}

const CAMPAIGN_URL = new URL('https://mise-place.com/waitlist?utm_source=google&utm_campaign=spring');

describe('captureAttribution is gated on cookie consent (art. 22.2 LSSI)', () => {
	const NO_CONSENT: [string, Record<string, string>][] = [
		['the visitor has made no choice yet', {}],
		['the visitor declined', { [CONSENT_COOKIE]: 'denied' }],
	];

	for (const [label, initial] of NO_CONSENT) {
		it(`writes nothing while ${label}`, () => {
			const j = jar(initial);
			captureAttribution(j.cookies, CAMPAIGN_URL, 'https://google.com/');
			expect(j.store.has(ATTRIBUTION_COOKIE)).toBe(false);
		});
	}

	it('clears an attribution cookie that predates a refusal', () => {
		const j = jar({
			[CONSENT_COOKIE]: 'denied',
			[ATTRIBUTION_COOKIE]: JSON.stringify({ source: 'google', campaign: 'old' }),
		});
		captureAttribution(j.cookies, CAMPAIGN_URL, null);
		expect(j.store.has(ATTRIBUTION_COOKIE)).toBe(false);
		expect(j.deleted).toContain(ATTRIBUTION_COOKIE);
	});

	it('writes the attribution once the visitor has granted consent', () => {
		const j = jar({ [CONSENT_COOKIE]: 'granted' });
		captureAttribution(j.cookies, CAMPAIGN_URL, 'https://google.com/search');

		const stored = parseAttributionCookie(j.store.get(ATTRIBUTION_COOKIE));
		expect(stored.source).toBe('google');
		expect(stored.campaign).toBe('spring');
		expect(stored.landingPath).toBe('/waitlist');
	});

	it('carries the extra fields a variant landing passes through', () => {
		const j = jar({ [CONSENT_COOKIE]: 'granted' });
		captureAttribution(j.cookies, new URL('https://mise-place.com/l/chefs'), null, { variant: 'chefs' });
		expect(parseAttributionCookie(j.store.get(ATTRIBUTION_COOKIE)).variant).toBe('chefs');
	});
});

describe('the consent cookie records the choice', () => {
	it('reads back an unset jar as "unset", which is not consent', () => {
		const j = jar();
		expect(readConsent(j.cookies)).toBe('unset');
		expect(analyticsConsentGiven(j.cookies)).toBe(false);
	});

	it('round-trips a grant and a refusal', () => {
		const j = jar();
		writeConsent(j.cookies, 'granted');
		expect(readConsent(j.cookies)).toBe('granted');
		expect(analyticsConsentGiven(j.cookies)).toBe(true);

		writeConsent(j.cookies, 'denied');
		expect(readConsent(j.cookies)).toBe('denied');
		expect(analyticsConsentGiven(j.cookies)).toBe(false);
	});

	it('treats an unrecognised cookie value as no consent, never as a grant', () => {
		for (const value of ['', 'true', 'yes', 'GRANTED', '1']) {
			expect(analyticsConsentGiven(jar({ [CONSENT_COOKIE]: value }).cookies)).toBe(false);
		}
	});
});
