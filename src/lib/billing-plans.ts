export type TierId = 'starter' | 'pro' | 'business';

export const PROVISIONAL_PRICE: Record<TierId, number> = { starter: 29, pro: 59, business: 129 };

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
			{ key: 'billing.tier.business.bullet.locations', interpolate: { n: 5 } },
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
