/**
 * Issue #747 item 2 — 404 heading is untranslated on the Spanish UI.
 *
 * An unmatched route (e.g. `/settings/privacy`) never reaches an app
 * `load` — SvelteKit throws its own 404 with `error.message === 'Not Found'`,
 * which both `+error.svelte` pages rendered verbatim. Fixed by special-casing
 * that literal default message through `error.notFound`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations } from '../src/lib/i18n';

const ROOT = path.resolve(__dirname, '..', 'src', 'routes');
const FILES = [
	path.join(ROOT, '+error.svelte'),
	path.join(ROOT, '(app)', '+error.svelte'),
];

describe('issue #747 — 404 route-miss message goes through i18n', () => {
	it('defines error.notFound in both locales', () => {
		expect(translations.es['error.notFound']).toBeTruthy();
		expect(translations.en['error.notFound']).toBeTruthy();
		expect(translations.es['error.notFound']).not.toBe(translations.en['error.notFound']);
	});

	for (const file of FILES) {
		it(`${path.relative(ROOT, file)} no longer renders SvelteKit's literal "Not Found" unconditionally`, () => {
			const source = readFileSync(file, 'utf8');
			expect(source).toContain("error.notFound");
			expect(source).toMatch(/\$page\.status === 404/);
			expect(source).toMatch(/\$page\.error\?\.message === 'Not Found'/);
		});
	}
});
