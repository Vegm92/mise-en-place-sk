/**
 * Issue #737 — recipe module cleanups: no dead exports, one place per rule.
 *
 * 1. `recipesByIds` (src/lib/server/recipes.ts) had no callers anywhere in
 *    src/ — dead, deleted. `recipeCost` (singular) only ever called its own
 *    sibling `recipeCosts` and had no callers itself — also dead, deleted.
 *    `nutritionHundreds` (src/lib/recipes.ts) is only used inside its own
 *    module — unexported. This test statically imports both modules and
 *    asserts the three symbols are gone from their exports, so a future
 *    re-add without a real caller is caught rather than silently shipping
 *    dead code again.
 *
 * 2. `RecipeLineRow.svelte` used to re-implement `wasteFactor` inline while
 *    already importing the real thing from `$lib/recipes` for other calls —
 *    a source scan pins that the component now calls the shared function
 *    instead of a hand-rolled copy of its formula.
 *
 * 3. The recipe sheet page used to filter out `nutrition-partial` with an
 *    inline `{#if w !== 'nutrition-partial'}` because it has no
 *    `rec.warn.sheet.*` key — a silent, easy-to-miss special case. It was
 *    replaced with `SHEET_WARN_KEY`, a `Record<RecipeWarning, string | null>`
 *    that TypeScript itself requires to cover every `RecipeWarning` member.
 *    This test pins that exhaustiveness at the value level too (in case the
 *    map is ever loosened to `Record<string, ...>`), and pins that every
 *    non-null key actually resolves in both locale tables.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as recipesModule from '../src/lib/recipes';
import * as serverRecipesModule from '../src/lib/server/recipes';
import { RECIPE_WARNINGS, SHEET_WARN_KEY } from '../src/lib/recipes';
import { translations } from '../src/lib/i18n-messages';

const ROOT = path.resolve(__dirname, '..');
const RECIPE_LINE_ROW = path.join(ROOT, 'src/lib/components/mep/RecipeLineRow.svelte');

describe('dead exports removed from the recipe modules (issue #737)', () => {
	it('src/lib/server/recipes.ts no longer exports recipesByIds or recipeCost', () => {
		expect('recipesByIds' in serverRecipesModule).toBe(false);
		expect('recipeCost' in serverRecipesModule).toBe(false);
	});

	it('src/lib/server/recipes.ts still exports recipeCosts (used by tests/recipe-graph-db.test.ts)', () => {
		expect('recipeCosts' in serverRecipesModule).toBe(true);
	});

	it('src/lib/recipes.ts no longer exports nutritionHundreds', () => {
		expect('nutritionHundreds' in recipesModule).toBe(false);
	});
});

describe('RecipeLineRow imports wasteFactor instead of re-implementing it (issue #737)', () => {
	const source = readFileSync(RECIPE_LINE_ROW, 'utf8');

	it('imports wasteFactor from $lib/recipes', () => {
		expect(source).toMatch(/import\s*\{[^}]*\bwasteFactor\b[^}]*\}\s*from\s*'\$lib\/recipes'/);
	});

	it('the merma factor is derived by calling wasteFactor, not a hand-rolled formula', () => {
		expect(source).toMatch(/const factor = \$derived\(wasteFactor\(waste\)\)/);
		expect(source).not.toMatch(/waste >= 0 && waste < 100 \? 1 - waste \/ 100 : 1/);
	});
});

describe('SHEET_WARN_KEY covers every RecipeWarning (issue #737)', () => {
	it('has an entry — a key or a deliberate null — for every RECIPE_WARNINGS member', () => {
		for (const w of RECIPE_WARNINGS) {
			expect(Object.prototype.hasOwnProperty.call(SHEET_WARN_KEY, w)).toBe(true);
		}
		expect(Object.keys(SHEET_WARN_KEY).sort()).toEqual([...RECIPE_WARNINGS].sort());
	});

	it('nutrition-partial is deliberately mapped to null (no rec.warn.sheet.* copy exists for it)', () => {
		expect(SHEET_WARN_KEY['nutrition-partial']).toBeNull();
	});

	it('every non-null key resolves in both locale tables', () => {
		for (const key of Object.values(SHEET_WARN_KEY)) {
			if (key === null) continue;
			expect(translations.es).toHaveProperty(key);
			expect(translations.en).toHaveProperty(key);
		}
	});
});
