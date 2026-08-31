/**
 * Settings → Alerts: a toggle per alert type (issue #577).
 *
 * The alerts pane only offered two thresholds, so a tenant drowning in (say)
 * duplicate-purchase nudges had no way to turn just those off. These tests
 * cover the settings half of the fix: the load exposes the current
 * preferences plus the grouping the pane renders, the action persists exactly
 * what the checkboxes said (an unchecked box is absent from the form body, so
 * the action has to treat "missing" as off), and every group/type label is
 * keyed in both locales.
 *
 * DB-backed for the load/action; the db singleton is swapped for the test
 * client. Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { translations } from '../src/lib/i18n-messages';
import {
	ALERT_PREFERENCE_TYPES,
	ALERT_PREFERENCE_GROUPS,
	loadAlertPreferences,
	saveAlertPreferences,
} from '../src/lib/server/alert-preferences';
import { memoizeEntitlements } from '../src/lib/server/billing';
import { actions, load } from '../src/routes/(app)/settings/+page.server';

const PAGE = 'src/routes/(app)/settings/+page.svelte';

let rid = '';
let userId = '';

function locals() {
	return {
		restaurantId: rid,
		user: { id: userId, email: 'alert-prefs@example.com', name: 'Chef', image: null },
		// hooks resolves the billing context once per request onto locals (#519)
		// and marks the locations the plan no longer covers (#679).
		entitlements: memoizeEntitlements(rid),
		lockedRestaurantIds: [] as string[],
	};
}

async function runAction(body: FormData) {
	const request = new Request('http://localhost/settings?/saveAlertPreferences', { method: 'POST', body });
	try {
		await (actions.saveAlertPreferences as (e: unknown) => Promise<unknown>)({ request, locals: locals() });
		return null;
	} catch (thrown) {
		return thrown as { status?: number; location?: string };
	}
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('settings-alert-prefs');
	rid = r.id;
	const email = `alert-prefs-${Date.now()}@example.com`;
	const [user] = await testSql`
		INSERT INTO users (email, name) VALUES (${email}, ${'Chef'}) RETURNING id`;
	userId = user.id;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${userId}, ${rid}, 'owner')`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	if (userId) await testSql`DELETE FROM users WHERE id = ${userId}`;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('settings load exposes the alert preferences (issue #577)', () => {
	it('returns the stored preferences and the grouping the pane renders', async () => {
		await saveAlertPreferences(rid, { price_shock: false });

		const data = await (load as (e: unknown) => Promise<Record<string, unknown>>)({ locals: locals() });

		const prefs = data.alertPreferences as Record<string, boolean>;
		expect(prefs.price_shock).toBe(false);
		expect(prefs.budget_overage).toBe(true);
		for (const type of ALERT_PREFERENCE_TYPES) expect(type in prefs).toBe(true);

		const groups = data.alertGroups as Array<{ id: string; types: string[] }>;
		expect(groups.map((g) => g.id)).toEqual(ALERT_PREFERENCE_GROUPS.map((g) => g.id));
		expect(groups.flatMap((g) => g.types).sort()).toEqual([...ALERT_PREFERENCE_TYPES].sort());

		await saveAlertPreferences(rid, { price_shock: true });
	});
});

describe.skipIf(!hasDbEnv)('saveAlertPreferences action (issue #577)', () => {
	it('persists checked boxes as enabled and every absent box as disabled', async () => {
		const body = new FormData();
		body.append('alert_price_shock', 'on');
		body.append('alert_weekly_digest', 'on');

		const thrown = await runAction(body);
		expect(thrown?.status).toBe(303);
		expect(thrown?.location).toBe('/settings');

		const prefs = await loadAlertPreferences(rid);
		expect(prefs.price_shock).toBe(true);
		expect(prefs.weekly_digest).toBe(true);
		expect(prefs.budget_overage).toBe(false);
		expect(prefs.low_stock_forecast).toBe(false);
		expect(prefs.possible_duplicate_purchase).toBe(false);
		expect(prefs.supplier_uncategorized).toBe(false);
		expect(prefs.invoice_reminders).toBe(false);
	});

	it('re-enables a type when its box comes back checked', async () => {
		const body = new FormData();
		for (const type of ALERT_PREFERENCE_TYPES) body.append(`alert_${type}`, 'on');

		expect((await runAction(body))?.status).toBe(303);

		const prefs = await loadAlertPreferences(rid);
		for (const type of ALERT_PREFERENCE_TYPES) expect(prefs[type]).toBe(true);
	});

	it("never writes another tenant's preferences", async () => {
		const other = await createTestRestaurant('settings-alert-prefs-other');
		try {
			const body = new FormData();
			const thrown = await runAction(body);
			expect(thrown?.status).toBe(303);

			const rows = await testSql`
				SELECT key FROM settings WHERE restaurant_id = ${other.id} AND key LIKE 'alert_pref_%'`;
			expect(rows).toHaveLength(0);
		} finally {
			await cleanupTestRestaurant(other.id);
		}
	});
});

describe('settings alerts pane renders a grouped toggle per alert type (issue #577)', () => {
	const src = readFileSync(PAGE, 'utf-8');

	it('posts the toggles to the saveAlertPreferences action', () => {
		expect(src).toMatch(/action="\?\/saveAlertPreferences"/);
	});

	it('walks the server-provided groups and their types', () => {
		expect(src).toMatch(/#each data\.alertGroups as \w+/);
		expect(src).toMatch(/#each \w+\.types as \w+/);
	});

	it('renders a checkbox toggle bound to the stored preference', () => {
		expect(src).toMatch(/type="checkbox"/);
		expect(src).toMatch(/name=\{`alert_\$\{\w+\}`\}/);
		expect(src).toMatch(/checked=\{data\.alertPreferences\[\w+\]\}/);
	});

	it('labels each group and each toggle through the i18n table', () => {
		expect(src).toMatch(/set\.alertPrefs\.group\.\$\{/);
		expect(src).toMatch(/set\.alertPrefs\.type\.\$\{/);
		expect(src).toMatch(/set\.alertPrefs\.desc\.\$\{/);
	});
});

describe('alert preference labels exist in both locales (issue #577)', () => {
	const keys = [
		'set.alertPrefs.title',
		'set.alertPrefs.sub',
		...ALERT_PREFERENCE_GROUPS.map((g) => `set.alertPrefs.group.${g.id}`),
		...ALERT_PREFERENCE_TYPES.flatMap((t) => [`set.alertPrefs.type.${t}`, `set.alertPrefs.desc.${t}`]),
	];

	it.each(['es', 'en'] as const)('has every key in %s', (locale) => {
		const table = translations[locale] as Record<string, string>;
		const missing = keys.filter((k) => !(k in table) || table[k].trim() === '');
		expect(missing).toEqual([]);
	});

	it('names the three groups the issue asked for, in Spanish', () => {
		const es = translations.es as Record<string, string>;
		expect(es['set.alertPrefs.group.purchase']).toBe('Alertas de compra');
		expect(es['set.alertPrefs.group.inventory']).toBe('Alertas de inventario');
		expect(es['set.alertPrefs.group.reports']).toBe('Reportes');
	});
});
