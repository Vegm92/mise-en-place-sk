/**
 * Recipe name reaches the emailed escandallo unescaped (issue #729).
 *
 * `recipeSheetEmail` interpolates the recipe name into `preheader` and
 * `headline`, and `sendSheet` (recipes/[id]/sheet) mails the rendered sheet
 * to any address the submitter types. A recipe name is unconstrained free
 * text, so an attacker-authored name became an HTML-injection / phishing
 * primitive from our sending domain. `renderEmailLayout` now escapes
 * `headline`/`preheader` itself, and the recipe name is stripped of
 * control characters before it reaches the subject line (header-injection
 * hygiene). This also covers the pre-existing `welcomeEmail` regression
 * guard so a double-escaping bug in the centralized layout would show up
 * here too.
 */
import { describe, it, expect } from 'vitest';
import { recipeSheetEmail, welcomeEmail } from '../src/lib/server/email';

const baseSheet = {
	id: 1,
	name: 'Tarta de queso',
	subtitle: '8 raciones',
	kpis: [{ label: 'Coste/ración', value: '1,20 €' }],
	lines: [{ name: 'Queso crema', qty: '500 g', amount: '3,50 €' }],
	total: '9,60 €',
	allergens: ['Lácteos'],
};

describe('recipeSheetEmail — recipe name is escaped in headline/preheader (#729)', () => {
	it('escapes an <img onerror> payload in both the headline and the preheader', () => {
		const { html } = recipeSheetEmail('chef@example.com', 'Casa Lua', {
			...baseSheet,
			name: '<img src=x onerror=alert(1)>',
		});
		expect(html).not.toContain('<img src=x onerror=alert(1)>');
		const escaped = '&lt;img src=x onerror=alert(1)&gt;';
		expect(html).toContain(`<h1 style="font-size:27px;line-height:1.18;font-weight:600;letter-spacing:-.025em;margin:0 0 14px;color:#15181f;">${escaped}</h1>`);
		// preheader is rendered twice (hidden preview text + visible top bar) plus once in the headline.
		expect((html.match(new RegExp(escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(3);
	});

	it('escapes a <b> tag so it renders as literal text, not markup', () => {
		const { html } = recipeSheetEmail('chef@example.com', 'Casa Lua', {
			...baseSheet,
			name: '<b>x</b>',
		});
		expect(html).not.toContain('<b>x</b>');
		expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
	});
});

describe('recipeSheetEmail — subject line has no header-injection characters (#729)', () => {
	it('strips CR/LF and other control characters from a name before it reaches the subject', () => {
		const { subject } = recipeSheetEmail('chef@example.com', 'Casa Lua', {
			...baseSheet,
			name: 'Tarta\r\nBcc: attacker@evil.com',
		});
		expect(subject).not.toMatch(/[\r\n]/);
		// eslint-disable-next-line no-control-regex
		expect(subject).not.toMatch(/[\x00-\x1f\x7f]/);
		expect(subject).toBe('Escandallo — Tarta Bcc: attacker@evil.com');
	});
});

describe('email layout centralized escaping — no double-escaping regression (#729)', () => {
	it('renders an "R&D" restaurant name as "R&amp;D" exactly once in welcomeEmail', () => {
		const { html } = welcomeEmail('chef@example.com', 'R&D');
		expect((html.match(/R&amp;D/g) ?? []).length).toBeGreaterThan(0);
		expect(html).not.toContain('R&amp;amp;D');
		expect(html).not.toContain('R&D<');
	});

	it('renders the recipe sheet preheader/headline for a benign name byte-identically to before centralizing (regression anchor)', () => {
		const { html } = recipeSheetEmail('chef@example.com', 'Casa Lua', baseSheet);
		expect(html).toContain('Tarta de queso: 8 raciones.');
		expect(html).toContain('<h1 style="font-size:27px;line-height:1.18;font-weight:600;letter-spacing:-.025em;margin:0 0 14px;color:#15181f;">Tarta de queso</h1>');
	});
});
