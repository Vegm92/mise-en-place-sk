/**
 * Issue #656 — dashboard mobile: period switcher, alerts entry, budget
 * "usado", greeting clipping.
 *
 * The measured layer is scripts/mobile-audit.mjs at 390px (desktopOnly token
 * list). What is checkable without a browser:
 *
 *   1. MobileDashboard renders the trend range switcher — both controls the
 *      desktop TrendChart has (granularity Día/Semana/Mes and window
 *      7d/30d/90d/1a/Todo) — and drives it against the same /api/trend
 *      endpoint the desktop switcher uses.
 *   2. The switcher pills reuse the frozen .period-track / .period-pill
 *      pattern (44px tap targets and sanctioned horizontal scrolling at
 *      mobile widths), not a bare scroller.
 *   3. The alerts strip carries a labeled "Ver todas" affordance into the
 *      full alerts list at /reminders.
 *   4. The budget bar area shows the "usado" figure (dash.budget.used plus
 *      the spent amount the page passes down).
 *   5. The greeting is no longer forced onto a single clipped line.
 *   6. Every i18n key the mobile branch uses resolves in both locales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations } from '../src/lib/i18n';

const ROOT = path.resolve(__dirname, '..');
const MOBILE_DASH = readFileSync(
	path.join(ROOT, 'src', 'lib', 'components', 'mobile', 'MobileDashboard.svelte'),
	'utf8',
);
const DASH_PAGE = readFileSync(
	path.join(ROOT, 'src', 'routes', '(app)', 'dashboard', '+page.svelte'),
	'utf8',
);

describe('mobile dashboard period switcher (issue #656)', () => {
	it('renders every granularity the desktop switcher offers', () => {
		expect(MOBILE_DASH, 'granularity pills should render $t(`chart.gran.${g}`)').toContain(
			'chart.gran.${g}',
		);
		for (const g of ['daily', 'weekly', 'monthly']) {
			expect(MOBILE_DASH, `granularity list should include '${g}'`).toContain(`'${g}'`);
		}
	});

	it('renders every window the desktop switcher offers', () => {
		expect(MOBILE_DASH, 'range pills should render $t(`chart.range.${r}`)').toContain(
			'chart.range.${r}',
		);
		for (const r of ['7d', '30d', '90d', '1y', 'all']) {
			expect(MOBILE_DASH, `range list should include '${r}'`).toContain(`'${r}'`);
		}
	});

	it('drives the same endpoint as the desktop TrendChart', () => {
		expect(MOBILE_DASH).toContain('/api/trend');
		expect(MOBILE_DASH).toMatch(/range=/);
		expect(MOBILE_DASH).toMatch(/granularity=/);
	});

	it('uses the frozen period pill pattern, not a bare scroller', () => {
		expect(MOBILE_DASH).toContain('period-track');
		expect(MOBILE_DASH).toContain('period-pill');
		expect(MOBILE_DASH).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/);
	});

	it('is seeded with the server-loaded trend data', () => {
		expect(DASH_PAGE).toMatch(/trend=\{data\.trend\}/);
		expect(MOBILE_DASH).toMatch(/\btrend\b/);
	});
});

describe('mobile dashboard alerts entry (issue #656)', () => {
	it('labels the route into the full alerts list', () => {
		const strip = MOBILE_DASH.slice(MOBILE_DASH.indexOf('href="/reminders"'));
		expect(strip.length).toBeGreaterThan(0);
		const anchorEnd = strip.indexOf('</a>');
		expect(anchorEnd).toBeGreaterThan(0);
		expect(strip.slice(0, anchorEnd), 'alerts strip should carry a visible "Ver todas" label').toContain(
			'mdash.viewAll',
		);
	});
});

describe('mobile dashboard budget usado (issue #656)', () => {
	it('shows the usado figure in the budget bar area', () => {
		expect(MOBILE_DASH).toContain('dash.budget.used');
		expect(MOBILE_DASH).toMatch(/totalSpent/);
	});

	it('receives the spent amount from the page', () => {
		expect(DASH_PAGE).toMatch(/totalSpent=\{data\.total_spent\}/);
	});
});

describe('mobile dashboard greeting (issue #656)', () => {
	it('no longer forces the greeting onto one clipped line', () => {
		const start = MOBILE_DASH.indexOf('{$t(greeting)}');
		expect(start).toBeGreaterThan(0);
		const tagStart = MOBILE_DASH.lastIndexOf('<div', start);
		const greetingTag = MOBILE_DASH.slice(tagStart, start);
		expect(greetingTag).not.toContain('white-space:nowrap');
		expect(greetingTag).not.toContain('text-overflow:ellipsis');
	});
});

describe('i18n keys the mobile branch relies on (issue #656)', () => {
	it('resolve in both locales', () => {
		const keys = [
			'chart.gran.daily',
			'chart.gran.weekly',
			'chart.gran.monthly',
			'chart.gran.daily.sub',
			'chart.gran.weekly.sub',
			'chart.gran.monthly.sub',
			'chart.range.7d',
			'chart.range.30d',
			'chart.range.90d',
			'chart.range.1y',
			'chart.range.all',
			'chart.loading',
			'chart.noSpendData',
			'dash.chart',
			'dash.budget.used',
			'mdash.viewAll',
		];
		const es = translations.es as Record<string, string>;
		const en = translations.en as Record<string, string>;
		for (const key of keys) {
			expect(es[key], `es missing ${key}`).toBeTruthy();
			expect(en[key], `en missing ${key}`).toBeTruthy();
		}
	});
});
