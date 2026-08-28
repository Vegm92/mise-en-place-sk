/**
 * Issue #747 item 4 — sidebar logout / switch-account buttons.
 *
 * `(app)/+layout.svelte`'s account-footer switch-account and logout buttons
 * were icon-only, `title`-only (no `aria-label`), sized to their ~13px icon
 * with 2px of padding — well under any reasonable tap target. Both now carry
 * an `aria-label` and a >=40px hit area.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(__dirname, '..', 'src', 'routes', '(app)', '+layout.svelte');
const source = readFileSync(FILE, 'utf8');

// The account footer (avatar + name + switch-account/logout icon buttons)
// sits between the restaurant-name line and the `{:else}` that starts the
// collapsed-sidebar markup — isolate it so the assertions below cannot
// accidentally match unrelated icon buttons elsewhere in the shell.
const footerStart = source.indexOf('{data.restaurantName}');
const footerEnd = source.indexOf('{:else}', footerStart);
const footer = source.slice(footerStart, footerEnd);

describe('issue #747 — sidebar account-footer icon buttons are accessible', () => {
	it('isolated the account-footer block', () => {
		expect(footerStart).toBeGreaterThan(-1);
		expect(footerEnd).toBeGreaterThan(footerStart);
		expect(footer).toContain('ArrowLeftRight');
		expect(footer).toContain('LogOut');
	});

	it('switch-account and logout buttons both carry title and aria-label', () => {
		for (const action of ['switchAccount', 'logout']) {
			expect(footer).toContain(`title={$t('action.${action}')}`);
			expect(footer).toContain(`aria-label={$t('action.${action}')}`);
		}
	});

	it('switch-account and logout buttons both size their hit area to at least 40px', () => {
		const matches = [...footer.matchAll(/aria-label=\{\$t\('action\.(switchAccount|logout)'\)\}[\s\S]{0,200}?style="([^"]*)"/g)];
		expect(matches).toHaveLength(2);
		for (const m of matches) {
			const style = m[2];
			const width = Number(style.match(/width:(\d+)px/)?.[1] ?? 0);
			const height = Number(style.match(/height:(\d+)px/)?.[1] ?? 0);
			expect(width, `${m[1]} button width`).toBeGreaterThanOrEqual(40);
			expect(height, `${m[1]} button height`).toBeGreaterThanOrEqual(40);
		}
	});
});
