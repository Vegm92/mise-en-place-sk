import { describe, it, expect } from 'vitest';
import { MATRIX_GROUPS, TIER_COPY, tierTagline, visibleMatrixRows, type PlanFeatureFlags } from '../src/lib/billing-plans';

const OFF: PlanFeatureFlags = { multiLocation: false, recipes: false };
const ON: PlanFeatureFlags = { multiLocation: true, recipes: true };

const keys = (flags: PlanFeatureFlags) => TIER_COPY.business.bullets(null, flags).map((b) => b.key);
const rowKeys = (flags: PlanFeatureFlags) => MATRIX_GROUPS.flatMap((g) => visibleMatrixRows(g, flags)).map((r) => r.labelKey);

describe('plan cards only advertise beta features whose flag is on', () => {
	it('drops the Business locations bullet and the group tagline while multiLocation is off', () => {
		expect(keys(OFF)).not.toContain('billing.tier.business.bullet.locations');
		expect(keys(ON)).toContain('billing.tier.business.bullet.locations');
		expect(tierTagline(TIER_COPY.business, OFF)).toBe('billing.tier.business.taglineSingle');
		expect(tierTagline(TIER_COPY.business, ON)).toBe('billing.tier.business.tagline');
		expect(tierTagline(TIER_COPY.pro, OFF)).toBe(TIER_COPY.pro.tagline);
	});

	it('hides the recipes and locations matrix rows while their flags are off', () => {
		expect(rowKeys(OFF)).not.toContain('billing.matrix.row.recipes');
		expect(rowKeys(OFF)).not.toContain('billing.matrix.row.locations');
		expect(rowKeys(ON)).toEqual(expect.arrayContaining(['billing.matrix.row.recipes', 'billing.matrix.row.locations']));
	});
});
