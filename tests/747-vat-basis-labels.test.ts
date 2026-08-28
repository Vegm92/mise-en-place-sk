/**
 * Issue #747 item 6 — dashboard ribbon sums gross totals, budgets sum net
 * line totals, and neither said so.
 *
 * `turno.ribbon.pace` / `turno.ribbon.forecast` (the dashboard's "Ritmo del
 * mes" / "Cierre previsto" stats) are driven by `invoices.totalAmount`
 * (gross, tax-inclusive — `dashboard/+page.server.ts`'s `mom.this_month`).
 * `/budgets`' totals are driven by `invoiceLineItems.totalPrice` (net, via
 * `category-spend.ts`'s `lineAmountExpr`). Both bases are legitimate; only
 * the missing label was the bug.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations } from '../src/lib/i18n';

const ROOT = path.resolve(__dirname, '..', 'src');

describe('issue #747 — dashboard vs. budgets spend basis is labelled', () => {
	it('confirms the dashboard ribbon still sums gross invoice totals', () => {
		const source = readFileSync(path.join(ROOT, 'routes', '(app)', 'dashboard', '+page.server.ts'), 'utf8');
		expect(source).toMatch(/this_month:\s*sql<number>`COALESCE\(SUM\(CASE WHEN[^`]*invoices\.totalAmount/);
	});

	it('confirms /budgets still sums net line-item totals', () => {
		const source = readFileSync(path.join(ROOT, 'routes', '(app)', 'budgets', '+page.server.ts'), 'utf8');
		expect(source).toMatch(/lineAmountExpr/);
	});

	it('turno.ribbon.pace and turno.ribbon.forecast say "con IVA" / "incl. VAT"', () => {
		expect(translations.es['turno.ribbon.pace']).toMatch(/con IVA/);
		expect(translations.es['turno.ribbon.forecast']).toMatch(/con IVA/);
		expect(translations.en['turno.ribbon.pace']).toMatch(/incl\. VAT/);
		expect(translations.en['turno.ribbon.forecast']).toMatch(/incl\. VAT/);
	});

	it('budgets page shows a "sin IVA" / "excl. VAT" note next to its totals', () => {
		expect(translations.es['bud.exVat']).toMatch(/sin IVA/);
		expect(translations.en['bud.exVat']).toMatch(/excl\. VAT/);

		const source = readFileSync(path.join(ROOT, 'routes', '(app)', 'budgets', '+page.svelte'), 'utf8');
		const occurrences = source.split("$t('bud.exVat')").length - 1;
		expect(occurrences, 'expected the note on both the desktop and mobile totals').toBeGreaterThanOrEqual(2);
	});
});
