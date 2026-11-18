/**
 * src/lib/attribution.ts — issue #326.
 *
 * Pure functions, no DB/network: UTM parsing off a URL + referer, defence
 * against attacker-controlled query params (overlong values, injection
 * characters, duplicated/non-allowlisted keys), and the mep_attr cookie
 * serialise/parse round-trip (including a tampered/malformed cookie value).
 */
import { describe, it, expect } from 'vitest';
import {
	ATTRIBUTION_COOKIE,
	EMPTY_ATTRIBUTION,
	hasAttributionSignal,
	parseAttribution,
	parseAttributionCookie,
	serializeAttribution,
} from '../src/lib/attribution';

function url(path: string): URL {
	return new URL(`https://mise-place.com${path}`);
}

describe('parseAttribution — UTM parsing', () => {
	it('captures utm_source and utm_campaign', () => {
		const a = parseAttribution(url('/waitlist?utm_source=x&utm_campaign=y'));
		expect(a.source).toBe('x');
		expect(a.campaign).toBe('y');
	});

	it('captures variant, segment and ref', () => {
		const a = parseAttribution(url('/waitlist?variant=b&segment=chefs&ref=ABC123'));
		expect(a.variant).toBe('b');
		expect(a.segment).toBe('chefs');
		expect(a.referredBy).toBe('ABC123');
	});

	it('captures the landing path from the URL, independent of query params', () => {
		const a = parseAttribution(url('/waitlist?utm_source=x'));
		expect(a.landingPath).toBe('/waitlist');
	});

	it('returns an all-null attribution for a plain visit with no signal', () => {
		const a = parseAttribution(url('/waitlist'));
		expect(a.source).toBeNull();
		expect(a.campaign).toBeNull();
		expect(a.variant).toBeNull();
		expect(a.segment).toBeNull();
		expect(a.referredBy).toBeNull();
		expect(a.referrer).toBeNull();
	});

	it('parses the referrer header into origin + pathname, dropping its query string', () => {
		const a = parseAttribution(url('/waitlist'), 'https://google.com/search?q=albaranes&secret=1');
		expect(a.referrer).toBe('https://google.com/search');
	});

	it('drops a malformed or non-http(s) referrer instead of storing it raw', () => {
		expect(parseAttribution(url('/waitlist'), 'not a url').referrer).toBeNull();
		expect(parseAttribution(url('/waitlist'), 'javascript:alert(1)').referrer).toBeNull();
		expect(parseAttribution(url('/waitlist'), null).referrer).toBeNull();
	});
});

describe('parseAttribution — non-allowlisted, duplicated and overlong input', () => {
	it('ignores query params that are not on the allowlist', () => {
		const a = parseAttribution(url('/waitlist?utm_source=x&evil=<script>alert(1)</script>&admin=true'));
		expect(a.source).toBe('x');
		expect(JSON.stringify(a)).not.toContain('evil');
		expect(JSON.stringify(a)).not.toContain('admin');
	});

	it('keeps only the first value when a param is duplicated', () => {
		const a = parseAttribution(url('/waitlist?utm_source=first&utm_source=second'));
		expect(a.source).toBe('first');
	});

	it('caps an overlong value instead of storing the full attacker-controlled string', () => {
		const long = 'a'.repeat(5000);
		const a = parseAttribution(url(`/waitlist?utm_campaign=${long}`));
		expect(a.campaign).not.toBeNull();
		expect(a.campaign!.length).toBeLessThan(200);
		expect(a.campaign!.length).toBeGreaterThan(0);
	});

	it('strips characters outside the safe charset (injection defence)', () => {
		const a = parseAttribution(url(`/waitlist?utm_source=${encodeURIComponent('<script>alert(1)</script>')}`));
		expect(a.source).not.toContain('<');
		expect(a.source).not.toContain('>');
		expect(a.source).not.toContain('"');
	});

	it("strips SQL-metacharacter-laden input to a safe fragment (values are parameterised regardless)", () => {
		const a = parseAttribution(url(`/waitlist?utm_source=${encodeURIComponent("x'; DROP TABLE waitlist;--")}`));
		expect(a.source).not.toContain("'");
		expect(a.source).not.toContain(';');
	});

	it('drops a param that is only whitespace or empty after stripping', () => {
		const a = parseAttribution(url('/waitlist?utm_source=%20%20&utm_campaign='));
		expect(a.source).toBeNull();
		expect(a.campaign).toBeNull();
	});
});

describe('mep_attr cookie round-trip', () => {
	it('exports the cookie name used by both /waitlist and /signup', () => {
		expect(ATTRIBUTION_COOKIE).toBe('mep_attr');
	});

	it('serialises and parses back an identical attribution object', () => {
		const original = parseAttribution(url('/waitlist?utm_source=x&utm_campaign=y&variant=b&segment=s&ref=r'));
		const roundTripped = parseAttributionCookie(serializeAttribution(original));
		expect(roundTripped).toEqual(original);
	});

	it('falls back to empty attribution for a missing cookie', () => {
		expect(parseAttributionCookie(undefined)).toEqual(EMPTY_ATTRIBUTION);
		expect(parseAttributionCookie(null)).toEqual(EMPTY_ATTRIBUTION);
		expect(parseAttributionCookie('')).toEqual(EMPTY_ATTRIBUTION);
	});

	it('falls back to empty attribution for malformed JSON (a tampered cookie)', () => {
		expect(parseAttributionCookie('{not json')).toEqual(EMPTY_ATTRIBUTION);
		expect(parseAttributionCookie('"just a string"')).toEqual(EMPTY_ATTRIBUTION);
		expect(parseAttributionCookie('42')).toEqual(EMPTY_ATTRIBUTION);
		expect(parseAttributionCookie('null')).toEqual(EMPTY_ATTRIBUTION);
	});

	it('re-sanitises a cookie value even if it was tampered with client-side to exceed the length cap', () => {
		const tampered = JSON.stringify({ ...EMPTY_ATTRIBUTION, source: 'x'.repeat(5000) });
		const parsed = parseAttributionCookie(tampered);
		expect(parsed.source!.length).toBeLessThan(200);
	});

	it('re-sanitises a cookie value with injected characters', () => {
		const tampered = JSON.stringify({ ...EMPTY_ATTRIBUTION, campaign: '<script>alert(1)</script>' });
		const parsed = parseAttributionCookie(tampered);
		expect(parsed.campaign).not.toContain('<');
	});

	it('ignores non-string fields smuggled into a tampered cookie', () => {
		const tampered = JSON.stringify({ ...EMPTY_ATTRIBUTION, source: { toString: () => 'x' } });
		expect(parseAttributionCookie(tampered).source).toBeNull();
	});
});

describe('hasAttributionSignal', () => {
	it('is false for an all-null attribution (a bare landing path is not a signal)', () => {
		expect(hasAttributionSignal({ ...EMPTY_ATTRIBUTION, landingPath: '/waitlist' })).toBe(false);
	});

	it('is true when any marketing field is set', () => {
		expect(hasAttributionSignal({ ...EMPTY_ATTRIBUTION, source: 'google' })).toBe(true);
		expect(hasAttributionSignal({ ...EMPTY_ATTRIBUTION, referredBy: 'ABC' })).toBe(true);
	});
});

describe('utm_content', () => {
	it('is captured next to utm_source / utm_campaign', () => {
		const a = parseAttribution(url('/waitlist?utm_source=ig&utm_campaign=redes-pieza-s1-a&utm_content=reel-3-a'));
		expect(a.source).toBe('ig');
		expect(a.campaign).toBe('redes-pieza-s1-a');
		expect(a.content).toBe('reel-3-a');
	});

	it('is null when the param is absent, empty or whitespace (existing links keep working)', () => {
		expect(parseAttribution(url('/waitlist?utm_source=ig')).content).toBeNull();
		expect(parseAttribution(url('/waitlist?utm_content=')).content).toBeNull();
		expect(parseAttribution(url('/waitlist?utm_content=%20%20')).content).toBeNull();
		expect(EMPTY_ATTRIBUTION.content).toBeNull();
	});

	it('is truncated to the same 100-char limit and stripped of unsafe characters', () => {
		const long = parseAttribution(url(`/waitlist?utm_content=${'a'.repeat(5000)}`)).content;
		expect(long).toHaveLength(100);
		const odd = parseAttribution(url('/waitlist?utm_content=' + encodeURIComponent('<script>alert(1)</script>;DROP TABLE'))).content;
		expect(odd).not.toMatch(/[<>;()]/);
	});

	it('is a signal on its own and survives the cookie round-trip', () => {
		const a = parseAttribution(url('/waitlist?utm_content=reel-3-a'));
		expect(hasAttributionSignal(a)).toBe(true);
		expect(parseAttributionCookie(serializeAttribution(a)).content).toBe('reel-3-a');
	});

	it('an old cookie without the field parses to content null', () => {
		const old = JSON.stringify({ source: 'x', campaign: 'y' });
		const parsed = parseAttributionCookie(old);
		expect(parsed.campaign).toBe('y');
		expect(parsed.content).toBeNull();
	});

	it('a tampered oversized cookie value is truncated too', () => {
		const tampered = JSON.stringify({ ...EMPTY_ATTRIBUTION, content: 'x'.repeat(5000) });
		expect(parseAttributionCookie(tampered).content).toHaveLength(100);
	});
});
