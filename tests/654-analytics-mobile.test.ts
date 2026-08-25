/**
 * Analytics mobile parity (issue #654).
 *
 * MobileAnalyticsSpend hid its two content sections behind data-length
 * guards, leaving a blank card-less void with no explanation when a tenant
 * has no top items or no categorized spend. MobileAnalyticsPrices dropped
 * the supplier filter and the desktop's 4-KPI grid entirely. The extraction
 * page had no mobile treatment at all. This spec locks in: unconditional
 * cards with empty states reusing existing i18n keys, the supplier select
 * and KPI grid on mobile prices, and the #651 `.tbl-stack` modifier on the
 * extraction tables.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const SPEND = read('src/lib/components/mobile/MobileAnalyticsSpend.svelte');
const PRICES = read('src/lib/components/mobile/MobileAnalyticsPrices.svelte');
const PRICES_PAGE = read('src/routes/(app)/analytics/prices/+page.svelte');
const PRICES_SERVER = read('src/routes/(app)/analytics/prices/+page.server.ts');
const EXTRACTION = read('src/routes/(app)/analytics/extraction/+page.svelte');

describe('analytics mobile parity (issue #654)', () => {
	it('spend sections are unconditional cards, not gated on data length', () => {
		expect(SPEND).not.toMatch(/\{#if top_items\?\.length > 0\}/);
		expect(SPEND).not.toMatch(/\{#if category_spend\?\.length > 0\}/);
	});

	it('spend renders empty states with existing i18n keys, no new ones', () => {
		expect(SPEND).toMatch(/\{#if !top_items\?\.length\}/);
		expect(SPEND).toContain("$t('spend.noDataYet')");
		expect(SPEND).toContain("$t('spend.emptyHint')");
		expect(SPEND).toContain("$t('spend.uploadFirst')");
		expect(SPEND).toMatch(/\{#if !category_spend\?\.length\}/);
		expect(SPEND).toContain("$t('spend.assignCategories')");
		expect(SPEND).toContain("$t('spend.viewSuppliers')");
	});

	it('mobile prices gains the supplier select mirroring the desktop pattern', () => {
		expect(PRICES).toMatch(/<select\s+name="supplier_id"/);
		expect(PRICES).toMatch(/<form method="get" action="\/analytics\/prices"/);
		expect(PRICES).toContain('suppliers as s');
	});

	it('mobile prices gains the 4-KPI grid with subtexts', () => {
		expect(PRICES).toContain("$t('prices.tracked')");
		expect(PRICES).toContain("$t('prices.noChange')");
		expect(PRICES).toContain("$t('prices.up')");
		expect(PRICES).toContain("$t('prices.down')");
		expect(PRICES).toContain("$t('prices.upSub')");
		expect(PRICES).toContain("$t('prices.noUp')");
		expect(PRICES).toContain("$t('prices.downSub')");
		expect(PRICES).toContain("$t('prices.noDown')");
		expect(PRICES).toContain("$t('prices.stablePrices')");
	});

	it('mobile prices renders the per-base-unit chip', () => {
		expect(PRICES).toContain("$t('prices.perBaseHint')");
		expect(PRICES).toMatch(/latest_normalized_price/);
	});

	it('desktop page passes suppliers and selected_supplier into the mobile component', () => {
		expect(PRICES_PAGE).toMatch(/suppliers=\{data\.suppliers\}/);
		expect(PRICES_PAGE).toMatch(/selected_supplier=\{data\.selected_supplier\}/);
	});

	it('prices server coerces MV numeric-as-string columns, null-preserving', () => {
		expect(PRICES_SERVER).toMatch(/Number\(r\.latest_price\)/);
		expect(PRICES_SERVER).toMatch(/const num = \(v: unknown\) =>/);
		expect(PRICES_SERVER).toMatch(/num\(r\.latest_normalized_price\)/);
		expect(PRICES_SERVER).toMatch(/num\(r\.prev_price\)/);
		expect(PRICES_SERVER).toMatch(/num\(r\.change_pct\)/);
	});

	it('extraction tables opt into the shared stacked-table modifier', () => {
		const tableCount = (EXTRACTION.match(/class="tbl tbl-stack"/g) ?? []).length;
		expect(tableCount).toBe(2);
		expect(EXTRACTION).toMatch(/<td class="tbl-stack-lead"/);
	});

	it('extraction stacked cells carry data-label for values that lose their header', () => {
		expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colCorrections'\)\}/);
		expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colPctInvoices'\)\}/);
		expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colInvoices'\)\}/);
		expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colAutoConfirmed'\)\}/);
		expect(EXTRACTION).toMatch(/data-label=\{\$t\('extract\.acc\.colAvgCorr'\)\}/);
	});
});
