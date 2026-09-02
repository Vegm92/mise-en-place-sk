import { eq, inArray } from 'drizzle-orm';
import { db, forTenant } from './db';
import { settings } from './schema';

export const ALERT_PREFERENCE_TYPES = [
	'price_shock',
	'budget_overage',
	'possible_duplicate_purchase',
	'supplier_uncategorized',
	'low_stock_forecast',
	'weekly_digest',
	'invoice_reminders',
] as const;

export type AlertPreferenceType = (typeof ALERT_PREFERENCE_TYPES)[number];

export type AlertPreferences = Record<AlertPreferenceType, boolean>;

export interface AlertPreferenceGroup {
	id: string;
	types: readonly AlertPreferenceType[];
}

export const ALERT_PREFERENCE_GROUPS: readonly AlertPreferenceGroup[] = [
	{ id: 'purchase', types: ['price_shock', 'budget_overage', 'possible_duplicate_purchase', 'supplier_uncategorized'] },
	{ id: 'inventory', types: ['low_stock_forecast'] },
	{ id: 'reports', types: ['weekly_digest', 'invoice_reminders'] },
];

const ALERT_PREFERENCE_KEY_PREFIX = 'alert_pref_';

const DISABLED = 'false';
const ENABLED = 'true';

export async function loadPrefixedBooleans<K extends string>(
	restaurantId: string,
	prefix: string,
	keys: readonly K[],
	defaultEnabled: boolean,
): Promise<Record<K, boolean>> {
	const tdb = forTenant(restaurantId);
	const rows = await db
		.select({ key: settings.key, value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, inArray(settings.key, keys.map((key) => `${prefix}${key}`))));

	const result = Object.fromEntries(keys.map((key) => [key, defaultEnabled])) as Record<K, boolean>;
	for (const row of rows) {
		const key = row.key.slice(prefix.length) as K;
		if (key in result) result[key] = row.value !== DISABLED;
	}
	return result;
}

export async function savePrefixedBooleans<K extends string>(
	restaurantId: string,
	prefix: string,
	keys: readonly K[],
	prefs: Partial<Record<K, boolean>>,
): Promise<void> {
	const entries = keys
		.filter((key) => prefs[key] !== undefined)
		.map((key) => ({ restaurantId, key: `${prefix}${key}`, value: prefs[key] ? ENABLED : DISABLED }));

	await Promise.all(entries.map((entry) =>
		db.insert(settings)
			.values(entry)
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: entry.value },
			})));
}

const NOTIFICATION_TYPE_PREFERENCE: Readonly<Record<string, AlertPreferenceType>> = {
	price_shock: 'price_shock',
	budget_overage: 'budget_overage',
	possible_duplicate_purchase: 'possible_duplicate_purchase',
	related_document_found: 'possible_duplicate_purchase',
	supplier_uncategorized: 'supplier_uncategorized',
	supplier_category_suggested: 'supplier_uncategorized',
	low_stock_forecast: 'low_stock_forecast',
};

export function alertPreferenceKey(type: AlertPreferenceType): string {
	return `${ALERT_PREFERENCE_KEY_PREFIX}${type}`;
}

export function preferenceForNotificationType(notificationType: string): AlertPreferenceType | null {
	return NOTIFICATION_TYPE_PREFERENCE[notificationType] ?? null;
}

export function defaultAlertPreferences(): AlertPreferences {
	return Object.fromEntries(ALERT_PREFERENCE_TYPES.map((type) => [type, true])) as AlertPreferences;
}

export async function loadAlertPreferences(restaurantId: string): Promise<AlertPreferences> {
	return loadPrefixedBooleans(restaurantId, ALERT_PREFERENCE_KEY_PREFIX, ALERT_PREFERENCE_TYPES, true);
}

export async function isAlertEnabled(restaurantId: string, type: AlertPreferenceType): Promise<boolean> {
	const tdb = forTenant(restaurantId);
	const rows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, alertPreferenceKey(type))))
		.limit(1);
	return rows[0]?.value !== DISABLED;
}

export async function saveAlertPreferences(
	restaurantId: string,
	prefs: Partial<AlertPreferences>,
): Promise<void> {
	return savePrefixedBooleans(restaurantId, ALERT_PREFERENCE_KEY_PREFIX, ALERT_PREFERENCE_TYPES, prefs);
}

export async function filterEnabledAlerts<T extends { notificationType: string }>(
	restaurantId: string,
	alerts: T[],
): Promise<T[]> {
	if (!alerts.some((alert) => preferenceForNotificationType(alert.notificationType) !== null)) return alerts;

	const prefs = await loadAlertPreferences(restaurantId);
	return alerts.filter((alert) => {
		const type = preferenceForNotificationType(alert.notificationType);
		return type === null || prefs[type];
	});
}
