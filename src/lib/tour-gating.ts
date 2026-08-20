export const TOUR_PAGES = [
	{ step: '3',  path: '/avisos',          anchor: 'avisos-main' },
	{ step: '4',  path: '/invoices',        anchor: 'invoices-main' },
	{ step: '5',  path: '/suppliers',       anchor: 'suppliers-main' },
	{ step: '6',  path: '/analytics/spend', anchor: 'analytics-main' },
	{ step: '11', path: '/settings',        anchor: 'settings-main' },
] as const;

export type TourFeatureKey = 'weeklyDigest' | 'stockTracking' | 'supplierScores' | 'multiLocation' | 'prioritySupport';

export const TOUR_FEATURE_REQUIREMENT: Partial<Record<string, TourFeatureKey>> = {};

export function tourPageAccessible(path: string, features: Partial<Record<TourFeatureKey, boolean>>): boolean {
	const required = TOUR_FEATURE_REQUIREMENT[path];
	return !required || !!features[required];
}

export function nextAccessibleIndex(
	pages: readonly { path: string }[],
	fromIndex: number,
	features: Partial<Record<TourFeatureKey, boolean>>,
): number {
	for (let i = fromIndex; i < pages.length; i++) {
		if (tourPageAccessible(pages[i].path, features)) return i;
	}
	return -1;
}
