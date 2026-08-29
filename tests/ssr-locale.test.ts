/**
 * GEO phase 2a — the locale that gets server-rendered.
 *
 * Before this change `src/lib/i18n.ts` held the only locale store, a
 * module-level `writable('es')` that `initLocale()` corrected inside
 * `onMount`. SSR therefore always emitted Spanish, `src/app.html` hardcoded
 * `lang="es"`, and the language toggle was a `<button>` — so no crawler could
 * see, or reach, the English half of the string table.
 *
 * Phase 2a moves the *rendered* locale onto the request: `hooks.server.ts`
 * resolves it, `+layout.server.ts` hands it to the page, and the public
 * surface reads it through a Svelte context (`src/lib/i18n-context.ts`)
 * instead of the shared module store. The module store survives, unchanged,
 * for the authenticated app (single-session, `noindex`) — see ADR-033.
 *
 * These tests cover the pure resolution/URL helpers plus the wiring that has
 * no unit seam: the placeholder in `app.html`, the `transformPageChunk` that
 * fills it, and the fact that `i18n-context.ts` holds no mutable module state
 * that could leak one request's locale into another's render.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveLocale } from '../src/lib/server/locale';
import { localeHref, otherLocale, parseLocale, requestedLocale, LOCALE_PARAM } from '../src/lib/locale-url';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const url = (href: string) => new URL(href, 'https://miseenplace.app');

describe('parseLocale / otherLocale', () => {
	it('accepts only the two supported locales', () => {
		expect(parseLocale('es')).toBe('es');
		expect(parseLocale('en')).toBe('en');
		expect(parseLocale('fr')).toBeNull();
		expect(parseLocale('EN')).toBeNull();
		expect(parseLocale(null)).toBeNull();
		expect(parseLocale(undefined)).toBeNull();
	});

	it('pairs each locale with the other one', () => {
		expect(otherLocale('es')).toBe('en');
		expect(otherLocale('en')).toBe('es');
	});
});

describe('requestedLocale', () => {
	it('reads the locale query parameter', () => {
		expect(requestedLocale(url('/waitlist?lang=en'))).toBe('en');
		expect(requestedLocale(url('/waitlist?lang=es'))).toBe('es');
	});

	it('ignores an unsupported or absent value', () => {
		expect(requestedLocale(url('/waitlist?lang=de'))).toBeNull();
		expect(requestedLocale(url('/waitlist'))).toBeNull();
	});
});

describe('localeHref', () => {
	it('addresses the other locale explicitly in both directions', () => {
		expect(localeHref(url('/waitlist'), 'en')).toBe('/waitlist?lang=en');
		expect(localeHref(url('/waitlist?lang=en'), 'es')).toBe('/waitlist?lang=es');
	});

	it('keeps the rest of the query string, attribution included', () => {
		const href = localeHref(url('/l/coste?ref=guia&utm_source=chatgpt.com'), 'en');
		const params = new URL(href, 'https://miseenplace.app').searchParams;
		expect(params.get('ref')).toBe('guia');
		expect(params.get('utm_source')).toBe('chatgpt.com');
		expect(params.get(LOCALE_PARAM)).toBe('en');
	});

	it('keeps the path, so the toggle never leaves the page', () => {
		expect(localeHref(url('/l/normativa'), 'en').startsWith('/l/normativa?')).toBe(true);
	});
});

describe('resolveLocale', () => {
	it('defaults to Spanish, and says the choice was not explicit', () => {
		expect(resolveLocale(url('/waitlist'), undefined)).toEqual({ locale: 'es', explicit: false });
	});

	it('honours the query parameter over the remembered cookie', () => {
		expect(resolveLocale(url('/waitlist?lang=en'), 'es')).toEqual({ locale: 'en', explicit: true });
		expect(resolveLocale(url('/waitlist?lang=es'), 'en')).toEqual({ locale: 'es', explicit: true });
	});

	it('falls back to the remembered cookie', () => {
		expect(resolveLocale(url('/waitlist'), 'en')).toEqual({ locale: 'en', explicit: true });
	});

	it('ignores a junk cookie rather than rendering a locale that does not exist', () => {
		expect(resolveLocale(url('/waitlist'), 'de')).toEqual({ locale: 'es', explicit: false });
		expect(resolveLocale(url('/waitlist'), '')).toEqual({ locale: 'es', explicit: false });
	});
});

describe('the rendered locale reaches the HTML shell', () => {
	const appHtml = read('src/app.html');
	const hooks = read('src/hooks.server.ts');

	it('app.html no longer hardcodes Spanish', () => {
		expect(appHtml).not.toMatch(/<html lang="es"/);
		expect(appHtml).toContain('<html lang="%mep.lang%">');
	});

	it('hooks.server.ts substitutes the placeholder from the request locale', () => {
		expect(hooks).toContain('transformPageChunk');
		expect(hooks).toContain("html.replace('%mep.lang%', e.locals.locale)");
	});

	it('hooks.server.ts resolves the locale onto locals before resolving the page', () => {
		expect(hooks).toContain('event.locals.locale = locale');
		expect(hooks.indexOf('applyLocale(event)')).toBeLessThan(hooks.indexOf('resolveWithContext(event, path, resolveWithLocale)'));
	});

	it('the root layout load resolves from url and cookie, so SvelteKit re-runs it on every navigation', () => {
		const layoutServer = read('src/routes/+layout.server.ts');
		expect(layoutServer).toContain('resolveLocale(url, cookies.get(LOCALE_COOKIE))');
		expect(layoutServer).not.toContain('locals.locale');
	});
});

describe('the public translator is request-scoped, not module-scoped', () => {
	const context = read('src/lib/i18n-context.ts');

	it('i18n-context.ts holds no mutable module-level store', () => {
		expect(context).not.toContain('writable');
	});

	it('reads the locale out of Svelte context and refuses to guess without it', () => {
		expect(context).toContain('getContext');
		expect(context).toContain('setContext');
		expect(context).toMatch(/throw new Error\(/);
	});

	it('the root layout provides the context', () => {
		const layout = read('src/routes/+layout.svelte');
		expect(layout).toContain('setLocaleContext');
		expect(layout).toContain('toStore(() => data.locale)');
		expect(layout).toContain('initLocale(data.locale, data.explicit)');
	});
});

describe('LandingPage renders from the request locale (issue: SSR emitted Spanish only)', () => {
	const landing = read('src/lib/components/landing/LandingPage.svelte');

	it('takes its translators from the context, not the module store', () => {
		expect(landing).toContain("from '$lib/i18n-context'");
		expect(landing).toContain('const baseT = getT();');
		expect(landing).toContain('const baseTi = getTi();');
		expect(landing).toContain('const locale = getLocale();');
		expect(landing).not.toMatch(/import \{ t as baseT/);
	});

	it('does not call initLocale during render — the server already decided', () => {
		expect(landing).not.toContain('initLocale(');
	});

	it('the language toggle is a followable link, not a button', () => {
		expect(landing).not.toContain('onclick={toggleLocale}');
		expect(landing).toContain('href={alternateHref}');
		expect(landing).toContain('hreflang={alternate}');
	});

	it('the toggle still remembers the choice for the authenticated app', () => {
		expect(landing).toContain('onclick={rememberLocale}');
		expect(landing).toContain('preferredLocale.set(alternate)');
	});
});

describe('the remembered locale is readable by the server', () => {
	const i18n = read('src/lib/i18n.ts');

	it('initLocale mirrors the preference into a cookie, not localStorage alone', () => {
		expect(i18n).toContain('document.cookie');
		expect(i18n).toContain('localStorage.setItem(LOCALE_COOKIE');
	});

	it('an explicit server locale wins over a stale localStorage value', () => {
		expect(i18n).toContain('serverExplicit ? serverLocale : (remembered ?? serverLocale)');
	});
});

function serverModules(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) serverModules(full, out);
		else if (/(^|\.)server\.ts$/.test(entry) || full.includes(`${path.sep}server${path.sep}`)) out.push(full);
	}
	return out;
}

describe('the module store is never mutated on the server (the leak ADR-033 exists to prevent)', () => {
	it('no server module calls locale.set / locale.update', () => {
		const offenders = serverModules(path.join(ROOT, 'src'))
			.filter((file) => /\blocale\.(set|update)\s*\(/.test(readFileSync(file, 'utf8')))
			.map((file) => path.relative(ROOT, file));
		expect(offenders).toEqual([]);
	});

	it('no server module imports the writable locale store', () => {
		const offenders = serverModules(path.join(ROOT, 'src'))
			.filter((file) => /import \{[^}]*\blocale\b[^}]*\} from '\$lib\/i18n'/.test(readFileSync(file, 'utf8')))
			.map((file) => path.relative(ROOT, file));
		expect(offenders).toEqual([]);
	});
});
