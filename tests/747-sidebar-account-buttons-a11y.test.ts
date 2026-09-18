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
			expect(footer).toContain(`title={t('action.${action}')}`);
			expect(footer).toContain(`aria-label={t('action.${action}')}`);
		}
	});

	// #845 moved these buttons off inline `style="width:40px;height:40px"` onto
	// the Tailwind `w-10 h-10` utilities. Resolve either spelling to pixels so
	// the >=40px invariant is still enforced rather than silently dropped: the
	// default Tailwind spacing scale is 0.25rem per step, so w-10 is 40px.
	const TAILWIND_SPACING_PX = 4;

	function sizePx(spelling: string, axis: 'w' | 'h'): number {
		const longhand = axis === 'w' ? 'width' : 'height';
		const inline = spelling.match(new RegExp(`${longhand}:(\\d+)px`));
		if (inline) return Number(inline[1]);

		const arbitrary = spelling.match(new RegExp(`(?:^|\\s)${axis}-\\[(\\d+)px\\]`));
		if (arbitrary) return Number(arbitrary[1]);

		const scale = spelling.match(new RegExp(`(?:^|\\s)${axis}-(\\d+(?:\\.\\d+)?)(?:\\s|$)`));
		if (scale) return Number(scale[1]) * TAILWIND_SPACING_PX;

		return 0;
	}

	it('switch-account and logout buttons both size their hit area to at least 40px', () => {
		const matches = [
			...footer.matchAll(
				/aria-label=\{t\('action\.(switchAccount|logout)'\)\}[\s\S]{0,200}?(?:style|class)="([^"]*)"/g,
			),
		];
		expect(matches).toHaveLength(2);
		for (const m of matches) {
			const spelling = m[2]!;
			expect(sizePx(spelling, 'w'), `${m[1]} button width`).toBeGreaterThanOrEqual(40);
			expect(sizePx(spelling, 'h'), `${m[1]} button height`).toBeGreaterThanOrEqual(40);
		}
	});
});
