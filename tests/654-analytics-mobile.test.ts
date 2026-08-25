/**
 * Analytics mobile parity (issue #654).
 *
 * All three analytics routes dropped desktop content on mobile:
 *
 *   - /analytics/spend: MobileAnalyticsSpend guarded both content sections
 *     behind non-empty checks, so an empty tenant saw four KPI cards over a
 *     blank void with no explanation — desktop shows the "Sin datos aún"
 *     empty state with an upload action plus the "Por categoría" panel and
 *     its assign-categories hint.
 *   - /analytics/prices: MobileAnalyticsPrices dropped the tracked/no-change
 *     KPIs, the supplier selector, the €/base-unit chip, and rendered a bare
 *     "Sin resultados" where desktop explains "Sin historial de precios
 *     todavía" with next steps.
 *   - /analytics/extraction: no mobile treatment at all; its two data tables
 *     reuse the landed #651 `.tbl-stack` opt-in instead of a fourth mobile
 *     component.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const SPEND_MOBILE = read('src/lib/components/mobile/MobileAnalyticsSpend.svelte');
const PRICES_MOBILE = read('src/lib/components/mobile/MobileAnalyticsPrices.svelte');
const PRICES_PAGE = read('src/routes/(app)/analytics/prices/+page.svelte');
const EXTRACTION = read('src/routes/(app)/analytics/extraction/+page.svelte');
const APP_CSS = read('src/app.css');

describe('analytics mobile parity (issue #654)', () => {
	describe('/analytics/spend mobile', () => {
		it('shows the desktop empty state when there are no top items', () => {
			expect(SPEND_MOBILE).toContain("$t('spend.noDataYet')");
			expect(SPEND_MOBILE).toContain("$t('spend.emptyHint')");
			expect(SPEND_MOBILE).toContain("$t('spend.uploadFirst')");
		});

		it('always renders the by-category panel, with the assign-categories hint when empty', () => {
			expect(SPEND_MOBILE).toContain("$t('spend.assignCategories')");
			expect(SPEND_MOBILE).toContain("$t('spend.viewSuppliers')");
			expect(SPEND_MOBILE).toContain("$t('spend.byCategorySub')");
			expect(SPEND_MOBILE).not.toMatch(/\{#if category_spend\?\.length > 0\}\s*<div class="card"/);
		});

		it('carries the top-items panel subtitle desktop has', () => {
			expect(SPEND_MOBILE).toContain("$t('spend.topItemsSub')");
		});
	});

	describe('/analytics/prices mobile', () => {
		it('shows the desktop no-history empty state instead of a bare "no results"', () => {
			expect(PRICES_MOBILE).toContain("$t('prices.noDataDesc')");
			expect(PRICES_MOBILE).toContain("$t('spend.uploadFirst')");
		});

		it('ports the tracked and no-change KPIs with their subtexts', () => {
			expect(PRICES_MOBILE).toContain("$t('prices.tracked')");
			expect(PRICES_MOBILE).toContain("$t('prices.inTotal')");
			expect(PRICES_MOBILE).toContain("$t('prices.noChange')");
			expect(PRICES_MOBILE).toContain("$t('prices.stablePrices')");
			expect(PRICES_MOBILE).toContain("$t('prices.upSub')");
			expect(PRICES_MOBILE).toContain("$t('prices.downSub')");
		});

		it('ports the per-supplier selector desktop drives ?supplier_id with', () => {
			expect(PRICES_MOBILE).toContain("$t('prices.allSuppliers')");
			expect(PRICES_MOBILE).toMatch(/name="supplier_id"/);
			expect(PRICES_PAGE).toMatch(/suppliers=\{data\.suppliers\}/);
			expect(PRICES_PAGE).toMatch(/selected_supplier=\{data\.selected_supplier\}/);
		});

		it('ports the normalized price-per-base-unit chip', () => {
			expect(PRICES_MOBILE).toContain('latest_normalized_price');
			expect(PRICES_MOBILE).toContain("$t('prices.perBaseHint')");
		});
	});

	describe('/analytics/extraction reuses the #651 stacked-table opt-in', () => {
		it('app.css still owns the frozen .tbl-stack pattern', () => {
			expect(APP_CSS).toContain('.tbl-stack thead { display: none; }');
		});

		it('both data tables opt in to tbl-stack', () => {
			const optIns = EXTRACTION.match(/<table[^>]*class="[^"]*tbl-stack[^"]*"/g) ?? [];
			expect(optIns.length).toBe(2);
		});

		it('rows keep a lead cell and captioned values below md', () => {
			expect(EXTRACTION).toContain('tbl-stack-lead');
			expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colCorrections'\)\}/);
			expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colInvoices'\)\}/);
			expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colAutoConfirmed'\)\}/);
			expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colAvgCorr'\)\}/);
		});
	});
});
