/**
 * Guards the DonutChart extraction (issue #882): the spend donut used to be
 * hand-drawn twice — once in the desktop page, once in
 * MobileAnalyticsSpend.svelte — with near-identical `<svg>`/`stroke-dasharray`
 * blocks in each. Both now import the shared `DonutChart.svelte` component
 * for the top-items donut and the new category donut, so this duplication
 * cannot silently come back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const DESKTOP_PAGE = read('src/routes/(app)/analytics/spend/+page.svelte');
const MOBILE_PAGE = read('src/lib/components/mobile/MobileAnalyticsSpend.svelte');

describe('DonutChart is the single source of the spend donut markup (issue #882)', () => {
	it('the desktop spend page imports and uses DonutChart', () => {
		expect(DESKTOP_PAGE).toMatch(/import DonutChart from '\$lib\/components\/mep\/DonutChart\.svelte'/);
		expect(DESKTOP_PAGE.match(/<DonutChart\b/g) ?? []).toHaveLength(2);
	});

	it('the mobile spend component imports and uses DonutChart', () => {
		expect(MOBILE_PAGE).toMatch(/import DonutChart from '\$lib\/components\/mep\/DonutChart\.svelte'/);
		expect(MOBILE_PAGE.match(/<DonutChart\b/g) ?? []).toHaveLength(2);
	});

	it('neither page hand-draws its own donut circle with stroke-dasharray any more', () => {
		expect(DESKTOP_PAGE).not.toMatch(/stroke-dasharray/);
		expect(MOBILE_PAGE).not.toMatch(/stroke-dasharray/);
	});

	it('both pages render a yearly spend-by-volume chart via TrendLineChart', () => {
		expect(DESKTOP_PAGE).toMatch(/import TrendLineChart from '\$lib\/components\/mep\/TrendLineChart\.svelte'/);
		expect(DESKTOP_PAGE).toContain("$t('spend.yearly.title')");
		expect(MOBILE_PAGE).toMatch(/import TrendLineChart from '\$lib\/components\/mep\/TrendLineChart\.svelte'/);
		expect(MOBILE_PAGE).toContain("$t('spend.yearly.title')");
	});

	it('the category panel renders a donut, not a category-colored bar fill', () => {
		expect(DESKTOP_PAGE).not.toMatch(/background:\{categoryColor\(cat\.category\)\};border-radius:4px/);
		expect(MOBILE_PAGE).not.toMatch(/background: \{categoryColor\(cat\.category\)\}; border-radius: 3px/);
	});
});
