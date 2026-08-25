import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MOBILE_PATH = path.resolve(
	__dirname,
	'../src/lib/components/mobile/MobileDashboard.svelte'
);
const PAGE_PATH = path.resolve(__dirname, '../src/routes/(app)/dashboard/+page.svelte');
const MOBILE = readFileSync(MOBILE_PATH, 'utf8');
const PAGE = readFileSync(PAGE_PATH, 'utf8');

describe('dashboard mobile gets the period switcher and trend chart (issue #656)', () => {
	it('accepts trend and totalSpent props', () => {
		expect(MOBILE).toMatch(/trend:\s*TrendData/);
		expect(MOBILE).toMatch(/totalSpent:\s*number/);
	});

	it('fetches /api/trend to refresh the range', () => {
		expect(MOBILE).toMatch(/fetch\(`\/api\/trend\?range=\$\{range\}&granularity=\$\{granularity\}`\)/);
	});

	it('renders granularity pills for day/week/month', () => {
		expect(MOBILE).toMatch(/GRANULARITIES\s*=\s*\['daily', 'weekly', 'monthly'\]/);
		expect(MOBILE).toMatch(/chart\.gran\.\$\{g\}/);
	});

	it('renders window pills for 7d/30d/90d/1y/all', () => {
		expect(MOBILE).toMatch(/RANGES\s*=\s*\['7d', '30d', '90d', '1y', 'all'\]/);
		expect(MOBILE).toMatch(/chart\.range\.\$\{r\}/);
	});

	it('reuses the existing period-track/period-pill classes, not new CSS', () => {
		expect(MOBILE).toMatch(/class="period-track"/);
		expect(MOBILE).toMatch(/class="period-pill/);
		expect(MOBILE).not.toMatch(/<style>/);
	});

	it('adds a Ver todas link into the alerts strip', () => {
		expect(MOBILE).toMatch(/href="\/reminders"/);
		expect(MOBILE).toMatch(/\$t\('action\.allAlerts'\)/);
	});

	it('shows a usado row under the budget bar', () => {
		expect(MOBILE).toMatch(/\$t\('dash\.budget\.used'\)/);
		expect(MOBILE).toMatch(/fmtEurCompact\(totalSpent\)/);
	});

	it('lets the greeting wrap instead of clipping', () => {
		const greetingBlock = MOBILE.match(/\{\$t\(greeting\)\} · \{dateStr\}[\s\S]{0,20}/)?.[0] ?? '';
		expect(MOBILE).not.toMatch(/white-space:nowrap;">\s*\{\$t\(greeting\)\}/);
		expect(greetingBlock).not.toBe('');
	});

	it('keeps the trend card total on the type scale', () => {
		expect(MOBILE).toMatch(/font-size: 20px; font-weight: 600; color: var\(--mep-fg\);/);
		expect(MOBILE).toMatch(/fmtEurCompact\(trendTotal\)/);
	});

	it('touches only the two new props in the dashboard page', () => {
		expect(PAGE).toMatch(/totalSpent=\{data\.total_spent\}/);
		expect(PAGE).toMatch(/trend=\{data\.trend\}/);
		expect(PAGE.match(/<MobileDashboard/g)?.length).toBe(1);
	});
});
