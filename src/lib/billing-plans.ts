export type TierId = 'starter' | 'pro' | 'business';

export type BillingInterval = 'month' | 'year';

const TIER_IDS: readonly TierId[] = ['starter', 'pro', 'business'];

function byTier<T>(value: (tier: TierId) => T): Record<TierId, T> {
	return Object.fromEntries(TIER_IDS.map((tier) => [tier, value(tier)])) as Record<TierId, T>;
}

export const PROVISIONAL_PRICE: Record<TierId, number> = { starter: 69, pro: 139, business: 299 };

export const ANNUAL_MONTHS_BILLED = 10;

export const ANNUAL_FREE_MONTHS = 12 - ANNUAL_MONTHS_BILLED;

export const ANNUAL_PRICE: Record<TierId, number> = byTier((tier) => PROVISIONAL_PRICE[tier] * ANNUAL_MONTHS_BILLED);

export const ANNUAL_MONTHLY_EQUIVALENT: Record<TierId, number> = byTier(
	(tier) => Math.round((ANNUAL_PRICE[tier] * 100) / 12) / 100,
);

export const TIER_QUOTA: Record<TierId, number | null> = { starter: 100, pro: 400, business: null };

export const TIER_MAX_LOCATIONS: Record<TierId, number> = { starter: 1, pro: 1, business: 10 };

export const FOUNDER_OFFER = { percentOff: 60, maxRedemptions: 50, redeemBy: '2026-12-13' } as const;

export const FOUNDER_PRICE: Record<TierId, number> = byTier(
	(tier) => Math.round(PROVISIONAL_PRICE[tier] * (100 - FOUNDER_OFFER.percentOff)) / 100,
);

export function tierPrice(tier: TierId, interval: BillingInterval): number {
	return interval === 'year' ? ANNUAL_PRICE[tier] : PROVISIONAL_PRICE[tier];
}

export type TierBullet = { key: string; interpolate?: Record<string, string | number> };

export interface TierCopy {
	tagline: string;
	inherits?: string;
	bullets: (quota: number | null) => TierBullet[];
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
		inherits: 'billing.tier.business.inherits',
		bullets: () => [
			{ key: 'billing.tier.business.bullet.quota' },
			{ key: 'billing.tier.business.bullet.locations', interpolate: { n: TIER_MAX_LOCATIONS.business } },
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
			{ labelKey: 'billing.matrix.row.recipes', cell: (c) => c.maxRecipes === null ? true : { upTo: c.maxRecipes } },
		],
	},
	{
		titleKey: 'billing.matrix.group.account',
		rows: [
			{ labelKey: 'billing.matrix.row.locations', cell: (c) => c.maxLocations > 1 ? { upTo: c.maxLocations } : c.maxLocations },
			{ labelKey: 'billing.matrix.row.prioritySupport', cell: (c) => c.features.prioritySupport },
		],
	},
];
