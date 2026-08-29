/**
 * Issue #732 — the escandallo editor's trailing "add a line" draft row was
 * rendered outside the keyed `{#each items as line (line.id)}` block, with
 * no key of its own. `RecipeLineRow.svelte` seeds its `$state` once via
 * `untrack` at mount (lines ~40-53), so the very same component instance
 * survives an `?/addItem` submission that only changes the `items` array —
 * the draft row kept showing the name/quantity/unit/allergens the user had
 * just submitted, duplicating the line on screen until the page was
 * reloaded.
 *
 * Fix: wrap the trailing draft `<RecipeLineRow>` in `{#key items.length}`.
 * A successful add changes `items.length`, so Svelte tears down and
 * recreates the draft row's component instance — its `untrack`-seeded
 * `$state` re-reads its (still-null `line`) defaults, i.e. resets to empty.
 * A failed add (fail(422)) never touches `items`, so `items.length` is
 * unchanged, the draft row's component instance is NOT recreated, and
 * whatever the user typed survives the failed submission.
 *
 * Source-scan only: this repo pins Svelte reactivity fixes structurally
 * rather than via component-mount tests (see e.g. #747's vat-basis-labels
 * test). Live-browser behavior for this fix was verified manually against
 * a local dev server (see PR/commit notes) — a source scan alone cannot
 * observe DOM state across a simulated `use:enhance` submission, but it can
 * make sure a future refactor can't silently drop the reset mechanism.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE = path.resolve(
	__dirname, '..', 'src', 'routes', '(app)', 'recipes', '[id]', '+page.svelte'
);

const source = () => readFileSync(PAGE, 'utf8');

describe('issue #732 — the escandallo draft row resets after a successful add', () => {
	it('wraps the trailing (unkeyed, line-less) draft row in {#key items.length}', () => {
		// Keyed items loop, immediately followed by a {#key items.length} block
		// wrapping the draft <RecipeLineRow> (no `line` prop — this is the "new
		// line" row, not one of the saved items).
		expect(source()).toMatch(
			/\{#each items as line \(line\.id\)\}[\s\S]*?\{\/each\}\s*\{#key items\.length\}\s*<RecipeLineRow\s+\{units\}\s+\{catalog\}\s+\{linkableRecipes\}\s*\/>\s*\{\/key\}/
		);
	});

	it('the draft row is never passed a `line` prop (it must stay the "new line" row)', () => {
		const keyBlockMatch = source().match(/\{#key items\.length\}([\s\S]*?)\{\/key\}/);
		expect(keyBlockMatch, '{#key items.length} block not found').not.toBeNull();
		expect(keyBlockMatch![1]).not.toMatch(/\{line\}/);
	});

	it('the key is derived from items.length, not from `form` (a repeated add must produce a NEW key value each time — a same-valued key would not reset the row on a second add)', () => {
		const keyBlockOpen = source().match(/\{#key\s+([^}]+)\}\s*<RecipeLineRow\s+\{units\}/);
		expect(keyBlockOpen, 'could not find the {#key ...} opening tag before the draft row').not.toBeNull();
		expect(keyBlockOpen![1].trim()).toBe('items.length');
	});

	it('RecipeLineRow still seeds its $state once via untrack — the mechanism {#key} relies on to reset', () => {
		const row = readFileSync(
			path.resolve(__dirname, '..', 'src', 'lib', 'components', 'mep', 'RecipeLineRow.svelte'),
			'utf8'
		);
		expect(row).toMatch(/let\s+name\s+=\s+\$state\(untrack\(\(\) => line\?\.name \?\? ''\)\)/);
	});
});
