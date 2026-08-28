export const TOUR_PAGES = [
	{ step: '3',  path: '/dashboard',       anchor: 'dashboard-main', tip: 'dashboard' },
	{ step: '4',  path: '/invoices',        anchor: 'invoices-main',  tip: 'invoices' },
	{ step: '5',  path: '/suppliers',       anchor: 'suppliers-main', tip: 'suppliers' },
	{ step: '6',  path: '/analytics/spend', anchor: 'analytics-main', tip: 'analytics' },
	{ step: '7',  path: '/budgets',         anchor: 'budgets-main',   tip: 'budgets' },
	{ step: '8',  path: '/reminders',       anchor: 'reminders-main', tip: 'reminders' },
	{ step: '9',  path: '/reports',         anchor: 'digest-main',    tip: 'reports' },
	{ step: '10', path: '/chat',            anchor: 'chat-main',      tip: 'chat' },
	{ step: '11', path: '/settings',        anchor: 'settings-main',  tip: 'settings' },
] as const;

export type TourFeatureKey = 'weeklyDigest' | 'stockTracking' | 'supplierScores' | 'multiLocation' | 'prioritySupport' | 'aiAssistant';

export const TOUR_FEATURE_REQUIREMENT: Partial<Record<string, TourFeatureKey>> = {
	'/reports': 'weeklyDigest',
};

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
