export type TierId = 'starter' | 'pro' | 'business';

export type BillingInterval = 'month' | 'year';

const TIER_IDS: readonly TierId[] = ['starter', 'pro', 'business'];

function byTier<T>(value: (tier: TierId) => T): Record<TierId, T> {
	return Object.fromEntries(TIER_IDS.map((tier) => [tier, value(tier)])) as Record<TierId, T>;
}

export const PROVISIONAL_PRICE: Record<TierId, number> = { starter: 29, pro: 59, business: 129 };

export const ANNUAL_MONTHS_BILLED = 10;

export const ANNUAL_FREE_MONTHS = 12 - ANNUAL_MONTHS_BILLED;

export const ANNUAL_PRICE: Record<TierId, number> = byTier((tier) => PROVISIONAL_PRICE[tier] * ANNUAL_MONTHS_BILLED);

export const ANNUAL_MONTHLY_EQUIVALENT: Record<TierId, number> = byTier(
	(tier) => Math.round((ANNUAL_PRICE[tier] * 100) / 12) / 100,
);

export const TIER_QUOTA: Record<TierId, number | null> = { starter: 100, pro: 300, business: null };

export const TIER_MAX_LOCATIONS: Record<TierId, number> = { starter: 1, pro: 1, business: 5 };

export const FOUNDER_OFFER = { percentOff: 60, maxRedemptions: 50, redeemBy: '2026-12-13' } as const;

export const FOUNDER_PRICE: Record<TierId, number> = byTier(
	(tier) => Math.round(PROVISIONAL_PRICE[tier] * (100 - FOUNDER_OFFER.percentOff)) / 100,
);

export function tierPrice(tier: TierId, interval: BillingInterval): number {
	return interval === 'year' ? ANNUAL_PRICE[tier] : PROVISIONAL_PRICE[tier];
}

export type TierBullet = { key: string; interpolate?: Record<string, string | number> };

export interface PlanFeatureFlags {
	multiLocation: boolean;
	recipes: boolean;
}

export interface TierCopy {
	tagline: string;
	singleLocationTagline?: string;
	inherits?: string;
	bullets: (quota: number | null, flags: PlanFeatureFlags) => TierBullet[];
}

export function tierTagline(copy: TierCopy, flags: PlanFeatureFlags): string {
	return !flags.multiLocation && copy.singleLocationTagline ? copy.singleLocationTagline : copy.tagline;
}

export const TIER_COPY: Record<TierId, TierCopy> = {
	starter: {
		tagline: 'billing.tier.starter.tagline',
		bullets: (quota) => [
			{ key: 'billing.tier.starter.bullet.quota', interpolate: { n: quota ?? 0 } },
			{ key: 'billing.tier.starter.bullet.spend' },
			{ key: 'billing.tier.starter.bullet.location' },
		],
	},
	pro: {
		tagline: 'billing.tier.pro.tagline',
		inherits: 'billing.tier.pro.inherits',
		bullets: (quota) => [
			{ key: 'billing.tier.pro.bullet.quota', interpolate: { n: quota ?? 0 } },
			{ key: 'billing.tier.pro.bullet.digest' },
			{ key: 'billing.tier.pro.bullet.assistant' },
			{ key: 'billing.tier.pro.bullet.analytics' },
		],
	},
	business: {
		tagline: 'billing.tier.business.tagline',
		singleLocationTagline: 'billing.tier.business.taglineSingle',
		inherits: 'billing.tier.business.inherits',
		bullets: (_quota, flags) => [
			{ key: 'billing.tier.business.bullet.quota' },
			...(flags.multiLocation
				? [{ key: 'billing.tier.business.bullet.locations', interpolate: { n: TIER_MAX_LOCATIONS.business } }]
				: []),
			{ key: 'billing.tier.business.bullet.support' },
		],
	},
};

export interface MatrixFeatures {
	weeklyDigest: boolean;
	stockTracking: boolean;
	supplierScores: boolean;
	multiLocation: boolean;
	prioritySupport: boolean;
	aiAssistant: boolean;
}

export interface MatrixColumn {
	id: string;
	name: string;
	quota: number | null;
	maxLocations: number;
	maxRecipes: number | null;
	features: MatrixFeatures;
}

export type MatrixCellValue = boolean | number | null | { upTo: number };

export interface MatrixRowDef {
	labelKey: string;
	flag?: keyof PlanFeatureFlags;
	cell: (col: MatrixColumn) => MatrixCellValue;
}

export interface MatrixGroupDef {
	titleKey: string;
	noteKey?: string;
	rows: MatrixRowDef[];
}

export const MATRIX_GROUPS: MatrixGroupDef[] = [
	{
		titleKey: 'billing.matrix.group.digitize',
		rows: [
			{ labelKey: 'billing.matrix.row.quota', cell: (c) => c.quota },
		],
	},
	{
		titleKey: 'billing.matrix.group.intelligence',
		noteKey: 'billing.matrix.intelligenceNote',
		rows: [
			{ labelKey: 'billing.matrix.row.digest', cell: (c) => c.features.weeklyDigest },
			{ labelKey: 'billing.matrix.row.assistant', cell: (c) => c.features.aiAssistant },
			{ labelKey: 'billing.matrix.row.priceAnalytics', cell: (c) => c.features.supplierScores },
		],
	},
	{
		titleKey: 'billing.matrix.group.operations',
		rows: [
			{ labelKey: 'billing.matrix.row.stock', cell: (c) => c.features.stockTracking },
			{ labelKey: 'billing.matrix.row.recipes', flag: 'recipes', cell: (c) => c.maxRecipes === null ? true : { upTo: c.maxRecipes } },
		],
	},
	{
		titleKey: 'billing.matrix.group.account',
		rows: [
			{ labelKey: 'billing.matrix.row.locations', flag: 'multiLocation', cell: (c) => c.maxLocations > 1 ? { upTo: c.maxLocations } : c.maxLocations },
			{ labelKey: 'billing.matrix.row.prioritySupport', cell: (c) => c.features.prioritySupport },
		],
	},
];

export function visibleMatrixRows(group: MatrixGroupDef, flags: PlanFeatureFlags): MatrixRowDef[] {
	return group.rows.filter((row) => !row.flag || flags[row.flag]);
}
