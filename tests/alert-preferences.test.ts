/**
 * Per-type alert/notification preferences (issue #577).
 *
 * The alerts settings used to expose only two thresholds, so every alert type
 * a producer could raise was effectively mandatory. These tests pin the
 * contract of the preference layer that fixes that:
 *
 *   - a registry of the toggleable types, grouped for the settings UI;
 *   - preferences persisted as `settings` rows (key/value, per tenant) and
 *     defaulting to enabled so existing tenants keep today's behaviour;
 *   - `saveAlerts` — the single choke point every producer funnels through —
 *     dropping alerts whose type the tenant switched off, while alert types
 *     without a toggle still always land.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped without
 * DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testSql, hasDbEnv } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import {
	ALERT_PREFERENCE_TYPES,
	ALERT_PREFERENCE_GROUPS,
	alertPreferenceKey,
	preferenceForNotificationType,
	loadAlertPreferences,
	saveAlertPreferences,
	isAlertEnabled,
	type AlertPreferenceType,
} from '../src/lib/server/alert-preferences';
import { saveAlerts } from '../src/lib/server/alerts';
import type { BatchItem } from '../src/lib/server/batch';
import { singleLineInvoiceForm, saveInvoiceOrThrow, documentTypedItem } from './helpers/invoice-save-form';

const restaurant = useTestRestaurant('alert-prefs-a');
const restaurantOther = useTestRestaurant('alert-prefs-b');
const UID = randomUUID();

const fakeItem = (documentType: 'factura' | 'albaran' | null): BatchItem => documentTypedItem(restaurant.id, documentType);

const form = singleLineInvoiceForm;

async function notificationsOfType(invoiceId: number, type: string) {
	return testSql`
		SELECT id FROM system_notifications
		WHERE restaurant_id = ${restaurant.id} AND invoice_id = ${invoiceId} AND notification_type = ${type}`;
}

function saveInvoice(opts: {
	documentType: 'factura' | 'albaran';
	invoiceNumber: string;
	invoiceDate: string;
	totalAmount: string;
	supplier: string;
	lineDescription?: string;
}): Promise<number> {
	return saveInvoiceOrThrow(fakeItem(opts.documentType), form(opts), restaurant.id, UID);
}

describe('alert preference registry (issue #577)', () => {
	it('covers every alert type the issue asks to make optional', () => {
		expect([...ALERT_PREFERENCE_TYPES].sort()).toEqual([
			'budget_overage',
			'invoice_reminders',
			'line_item_mismatch',
			'low_stock_forecast',
			'possible_duplicate_purchase',
			'price_shock',
			'supplier_uncategorized',
			'weekly_digest',
		]);
	});

	it('groups every type exactly once, under the three groups the settings UI renders', () => {
		expect(ALERT_PREFERENCE_GROUPS.map((g) => g.id)).toEqual(['purchase', 'inventory', 'reports']);
		const grouped = ALERT_PREFERENCE_GROUPS.flatMap((g) => [...g.types]);
		expect([...grouped].sort()).toEqual([...ALERT_PREFERENCE_TYPES].sort());
		expect(new Set(grouped).size).toBe(grouped.length);
	});

	it('namespaces the settings key so it cannot collide with the threshold keys', () => {
		expect(alertPreferenceKey('price_shock')).toBe('alert_pref_price_shock');
		for (const type of ALERT_PREFERENCE_TYPES) {
			expect(alertPreferenceKey(type).startsWith('alert_pref_')).toBe(true);
		}
	});

	it('maps producer notification types onto the toggle that governs them', () => {
		expect(preferenceForNotificationType('price_shock')).toBe('price_shock');
		expect(preferenceForNotificationType('budget_overage')).toBe('budget_overage');
		expect(preferenceForNotificationType('low_stock_forecast')).toBe('low_stock_forecast');
		expect(preferenceForNotificationType('possible_duplicate_purchase')).toBe('possible_duplicate_purchase');
		expect(preferenceForNotificationType('line_item_mismatch')).toBe('line_item_mismatch');
		expect(preferenceForNotificationType('supplier_uncategorized')).toBe('supplier_uncategorized');
		expect(preferenceForNotificationType('supplier_category_suggested')).toBe('supplier_uncategorized');
	});

	it('leaves alert types without a toggle ungoverned', () => {
		expect(preferenceForNotificationType('verifactu_qr_mismatch')).toBeNull();
		expect(preferenceForNotificationType('product_suggestion')).toBeNull();
		expect(preferenceForNotificationType('unit_conversion_needed')).toBeNull();
	});
});

describe.skipIf(!hasDbEnv)('alert preferences persist in the settings table (issue #577)', () => {
	it('defaults every type to enabled when the tenant never touched the toggles', async () => {
		const prefs = await loadAlertPreferences(restaurant.id);
		for (const type of ALERT_PREFERENCE_TYPES) expect(prefs[type]).toBe(true);
	});

	it('round-trips a saved set of preferences through the database', async () => {
		const disabled: AlertPreferenceType[] = ['price_shock', 'weekly_digest'];
		const desired = Object.fromEntries(
			ALERT_PREFERENCE_TYPES.map((t) => [t, !disabled.includes(t)]),
		) as Record<AlertPreferenceType, boolean>;

		await saveAlertPreferences(restaurant.id, desired);

		const stored = await testSql`
			SELECT key, value FROM settings WHERE restaurant_id = ${restaurant.id} AND key LIKE 'alert_pref_%' ORDER BY key`;
		expect(stored).toHaveLength(ALERT_PREFERENCE_TYPES.length);
		const byKey = Object.fromEntries(stored.map((r) => [r.key, r.value]));
		expect(byKey[alertPreferenceKey('price_shock')]).toBe('false');
		expect(byKey[alertPreferenceKey('weekly_digest')]).toBe('false');
		expect(byKey[alertPreferenceKey('budget_overage')]).toBe('true');

		expect(await loadAlertPreferences(restaurant.id)).toEqual(desired);
	});

	it('updates the existing row instead of appending a second one when a toggle flips back', async () => {
		await saveAlertPreferences(restaurant.id, { price_shock: true });

		const rows = await testSql`
			SELECT value FROM settings WHERE restaurant_id = ${restaurant.id} AND key = ${alertPreferenceKey('price_shock')}`;
		expect(rows).toHaveLength(1);
		expect(rows[0]!.value).toBe('true');
		expect(await isAlertEnabled(restaurant.id, 'price_shock')).toBe(true);
	});

	it('reads a single toggle without loading the rest', async () => {
		await saveAlertPreferences(restaurant.id, { low_stock_forecast: false });
		expect(await isAlertEnabled(restaurant.id, 'low_stock_forecast')).toBe(false);
		await saveAlertPreferences(restaurant.id, { low_stock_forecast: true });
		expect(await isAlertEnabled(restaurant.id, 'low_stock_forecast')).toBe(true);
	});

	it('keeps preferences per tenant', async () => {
		await saveAlertPreferences(restaurant.id, { budget_overage: false });
		expect(await isAlertEnabled(restaurant.id, 'budget_overage')).toBe(false);
		expect(await isAlertEnabled(restaurantOther.id, 'budget_overage')).toBe(true);
		await saveAlertPreferences(restaurant.id, { budget_overage: true });
	});
});

describe.skipIf(!hasDbEnv)('saveAlerts drops alert types the tenant switched off (issue #577)', () => {
	it('persists an enabled type and skips a disabled one from the same batch', async () => {
		const invoiceId = await saveInvoice({
			documentType: 'factura',
			invoiceNumber: 'PREF-FILTER-1',
			invoiceDate: '2024-07-01',
			totalAmount: '31.00',
			supplier: '__alert_pref_filter__',
		});

		await saveAlertPreferences(restaurant.id, { price_shock: false, low_stock_forecast: true });

		await saveAlerts(invoiceId, restaurant.id, [
			{ notificationType: 'price_shock', message: 'price_shock: disabled', payload: {} },
			{ notificationType: 'low_stock_forecast', message: 'low_stock_forecast: enabled', payload: {} },
			{ notificationType: 'verifactu_qr_mismatch', message: 'verifactu_qr_mismatch: ungoverned', payload: {} },
		]);

		expect(await notificationsOfType(invoiceId, 'price_shock')).toHaveLength(0);
		expect(await notificationsOfType(invoiceId, 'low_stock_forecast')).toHaveLength(1);
		expect(await notificationsOfType(invoiceId, 'verifactu_qr_mismatch')).toHaveLength(1);

		await saveAlertPreferences(restaurant.id, { price_shock: true });
	});

	it('lets a supplier category suggestion ride on the supplier toggle', async () => {
		const invoiceId = await saveInvoice({
			documentType: 'factura',
			invoiceNumber: 'PREF-FILTER-2',
			invoiceDate: '2024-07-02',
			totalAmount: '32.00',
			supplier: '__alert_pref_filter_2__',
		});

		await saveAlertPreferences(restaurant.id, { supplier_uncategorized: false });
		await saveAlerts(invoiceId, restaurant.id, [
			{ notificationType: 'supplier_category_suggested', message: 'supplier_category_suggested: x', payload: {} },
		]);
		expect(await notificationsOfType(invoiceId, 'supplier_category_suggested')).toHaveLength(0);

		await saveAlertPreferences(restaurant.id, { supplier_uncategorized: true });
		await saveAlerts(invoiceId, restaurant.id, [
			{ notificationType: 'supplier_category_suggested', message: 'supplier_category_suggested: x', payload: {} },
		]);
		expect(await notificationsOfType(invoiceId, 'supplier_category_suggested')).toHaveLength(1);
	});
});

describe.skipIf(!hasDbEnv)('a disabled type generates no notification end-to-end (issue #577)', () => {
	it('raises the duplicate-purchase nudge while enabled and stays silent once switched off', async () => {
		await saveAlertPreferences(restaurant.id, { possible_duplicate_purchase: true });

		const supplierOn = '__alert_pref_dupe_on__';
		await saveInvoice({
			documentType: 'albaran', invoiceNumber: 'PREF-ALB-1', invoiceDate: '2024-08-01',
			totalAmount: '250.00', supplier: supplierOn, lineDescription: 'Tomates frescos',
		});
		const facturaOn = await saveInvoice({
			documentType: 'factura', invoiceNumber: 'PREF-FAC-1', invoiceDate: '2024-08-10',
			totalAmount: '255.00', supplier: supplierOn, lineDescription: 'Servicio de transporte',
		});
		expect(await notificationsOfType(facturaOn, 'possible_duplicate_purchase')).toHaveLength(1);

		await saveAlertPreferences(restaurant.id, { possible_duplicate_purchase: false });

		const supplierOff = '__alert_pref_dupe_off__';
		await saveInvoice({
			documentType: 'albaran', invoiceNumber: 'PREF-ALB-2', invoiceDate: '2024-09-01',
			totalAmount: '250.00', supplier: supplierOff, lineDescription: 'Tomates frescos',
		});
		const facturaOff = await saveInvoice({
			documentType: 'factura', invoiceNumber: 'PREF-FAC-2', invoiceDate: '2024-09-10',
			totalAmount: '255.00', supplier: supplierOff, lineDescription: 'Servicio de transporte',
		});
		expect(await notificationsOfType(facturaOff, 'possible_duplicate_purchase')).toHaveLength(0);

		await saveAlertPreferences(restaurant.id, { possible_duplicate_purchase: true });
	});
});
