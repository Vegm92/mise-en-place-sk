/**
 * Segment-aware welcome email (issue #328).
 *
 * `welcomeEmail` takes an optional `venueType` and leads with a
 * segment-specific paragraph for the menú-del-día and grupo variants;
 * every other venueType (including null/undefined/unknown) falls back to
 * today's exact copy, so an existing tenant with a NULL venueType renders
 * unchanged. The restaurant name is still HTML-escaped exactly like every
 * other user-text interpolation in this module (#729's lesson).
 */
import { describe, it, expect } from 'vitest';
import { welcomeEmail } from '../src/lib/server/email';

describe('welcomeEmail — default (no venueType)', () => {
	it('matches today\'s copy when venueType is omitted', () => {
		const { html } = welcomeEmail('chef@example.com', 'Casa Lua');
		expect(html).toContain('Tu cuenta para <strong');
		expect(html).not.toContain('menú del día');
		expect(html).not.toContain('varios locales');
	});

	it('matches today\'s copy when venueType is explicitly null (existing NULL tenant)', () => {
		const withNull = welcomeEmail('chef@example.com', 'Casa Lua', null);
		const withUndefined = welcomeEmail('chef@example.com', 'Casa Lua');
		expect(withNull.html).toBe(withUndefined.html);
	});

	it('falls back cleanly for a venueType with no dedicated intro (e.g. carta, hotel, bar_tapas)', () => {
		const base = welcomeEmail('chef@example.com', 'Casa Lua');
		for (const venueType of ['carta', 'hotel', 'bar_tapas', 'unknown-value']) {
			expect(welcomeEmail('chef@example.com', 'Casa Lua', venueType).html).toBe(base.html);
		}
	});
});

describe('welcomeEmail — segment-aware lead paragraph', () => {
	it('leads with price-shock setup for menu_del_dia', () => {
		const { html } = welcomeEmail('chef@example.com', 'Casa Lua', 'menu_del_dia');
		expect(html).toContain('céntimos por cubierto');
	});

	it('leads with multi-location onboarding for grupo', () => {
		const { html } = welcomeEmail('chef@example.com', 'Casa Lua', 'grupo');
		expect(html).toContain('varios locales');
	});

	it('differs from the default copy for both segmented variants', () => {
		const base = welcomeEmail('chef@example.com', 'Casa Lua').html;
		expect(welcomeEmail('chef@example.com', 'Casa Lua', 'menu_del_dia').html).not.toBe(base);
		expect(welcomeEmail('chef@example.com', 'Casa Lua', 'grupo').html).not.toBe(base);
	});
});

describe('welcomeEmail — restaurant name is HTML-escaped (issue #729\'s lesson)', () => {
	it('escapes HTML-significant characters in the restaurant name', () => {
		const { html } = welcomeEmail('chef@example.com', '<img src=x onerror=alert(1)>');
		expect(html).not.toContain('<img src=x onerror=alert(1)>');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
	});

	it('escapes the restaurant name the same way with a segment lead paragraph present', () => {
		const { html } = welcomeEmail('chef@example.com', '<script>evil()</script>', 'menu_del_dia');
		expect(html).not.toContain('<script>evil()</script>');
		expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
	});
});
