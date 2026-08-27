/**
 * Mobile dashboard — the "Panel de turno · móvil" design canvas.
 *
 * Supersedes the issue #656 dashboard (trend range switcher, alerts entry,
 * budget "usado" bar): the mobile /dashboard now runs on the same
 * dashboard-turno worklist engine as the desktop rebuild (d3a6320), not a
 * standalone chart/alerts/budget-bar layout. What is checkable without a
 * browser:
 *
 *   1. MobileDashboard builds its worklist/rail data from the shared
 *      dashboard-turno engine, the same one the desktop screen uses.
 *   2. The worklist renders WorkCardMobile items and offers the same
 *      money/urgency sort toggle as desktop.
 *   3. The rail carries pace, category-risk and cash-out blocks, with the
 *      cash-out block linking into /reminders.
 *   4. The dashboard route threads the full page data (not a hand-picked
 *      subset) and the period-nav props into MobileDashboard, same as it
 *      does for DesktopDashboard.
 *   5. The greeting is not forced onto a single clipped line.
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
const WORK_CARD_MOBILE = readFileSync(
	path.join(ROOT, 'src', 'lib', 'components', 'mobile', 'turno', 'WorkCardMobile.svelte'),
	'utf8',
);
const DASH_PAGE = readFileSync(
	path.join(ROOT, 'src', 'routes', '(app)', 'dashboard', '+page.svelte'),
	'utf8',
);

describe('mobile dashboard turno worklist', () => {
	it('builds its worklist and rail data from the shared dashboard-turno engine', () => {
		expect(MOBILE_DASH).toMatch(/from '\$lib\/dashboard-turno'/);
		for (const fn of ['buildWorklist', 'buildCategoryRisk', 'buildPaceCurve', 'sortWorklist', 'atStake']) {
			expect(MOBILE_DASH, `should call ${fn}`).toContain(fn);
		}
	});

	it('renders each worklist item with WorkCardMobile', () => {
		expect(MOBILE_DASH).toMatch(/<WorkCardMobile\s/);
		expect(MOBILE_DASH).toMatch(/sortedWorklist as item/);
	});

	it('offers the same money/urgency sort toggle as desktop', () => {
		expect(MOBILE_DASH).toContain('turno.sort.toUrgency');
		expect(MOBILE_DASH).toContain('turno.sort.toMoney');
		expect(MOBILE_DASH).toMatch(/sortMode = sortMode === 'money' \? 'urgency' : 'money'/);
	});

	it('shows the at-stake total and item/urgent count', () => {
		expect(MOBILE_DASH).toContain('turno.atStake');
		expect(MOBILE_DASH).toContain('mdash.turno.stakeSub');
	});
});

describe('mobile work card', () => {
	it('gives its action a 44px-tall tap target via the shared .btn class', () => {
		expect(WORK_CARD_MOBILE).toMatch(/class="btn \{primary/);
	});

	it('shares its icon/tone mapping with the desktop work card', () => {
		expect(WORK_CARD_MOBILE).toMatch(/from '\$lib\/components\/turno\/work-item-ui'/);
	});
});

describe('mobile dashboard rail (supersedes the #656 alerts entry)', () => {
	it('renders the pace, category-risk and cash-out rail blocks', () => {
		for (const key of ['turno.rail.pace', 'turno.rail.cats', 'turno.rail.cashOut']) {
			expect(MOBILE_DASH, `should render a RailBlock titled ${key}`).toContain(key);
		}
	});

	it('labels the cash-out block route into the full reminders list', () => {
		const strip = MOBILE_DASH.slice(MOBILE_DASH.indexOf('href="/reminders"'));
		expect(strip.length).toBeGreaterThan(0);
		const anchorEnd = strip.indexOf('</a>');
		expect(anchorEnd).toBeGreaterThan(0);
		expect(strip.slice(0, anchorEnd), 'cash-out block should carry a visible label').toContain(
			'turno.rail.cashOutAll',
		);
	});
});

describe('mobile dashboard data threading', () => {
	it('passes the full page data into MobileDashboard, like DesktopDashboard', () => {
		expect(DASH_PAGE).toMatch(/<MobileDashboard[\s\S]*?\{data\}/);
		expect(DASH_PAGE).toMatch(/<DesktopDashboard[\s\S]*?\{data\}/);
	});

	it('passes the same period-nav props to both dashboards', () => {
		for (const prop of ['prevMonthUrl', 'nextMonthUrl', 'canGoForward', 'currentPeriod']) {
			const mobileCount = (DASH_PAGE.match(new RegExp(`${prop}=\\{${prop}\\}`, 'g')) ?? []).length;
			expect(mobileCount, `${prop} should be passed to both dashboards`).toBe(2);
		}
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

describe('i18n keys the mobile branch relies on', () => {
	it('resolve in both locales', () => {
		const keys = [
			'mdash.morning',
			'mdash.afternoon',
			'mdash.evening',
			'mdash.turno.stakeSub',
			'turno.atStake',
			'turno.atStakeUnit',
			'turno.ribbon.pace',
			'turno.ribbon.forecast',
			'turno.ribbon.review',
			'turno.ribbon.cashOut',
			'turno.worklist.title',
			'turno.worklist.subMoney.zero',
			'turno.sort.toUrgency',
			'turno.sort.toMoney',
			'turno.empty.title',
			'turno.empty.body',
			'turno.empty.action',
			'turno.rail.pace',
			'turno.rail.paceEmpty',
			'turno.rail.paceAriaChart',
			'turno.rail.forecastLabel',
			'turno.rail.cats',
			'turno.rail.catsAll',
			'turno.rail.catsEmpty',
			'turno.rail.cashOut',
			'turno.rail.cashOutAll',
			'turno.rail.cashOutEmpty',
			'turno.rail.overdue',
			'turno.rail.days',
		];
		const es = translations.es as Record<string, string>;
		const en = translations.en as Record<string, string>;
		for (const key of keys) {
			expect(es[key], `es missing ${key}`).toBeTruthy();
			expect(en[key], `en missing ${key}`).toBeTruthy();
		}
	});
});
