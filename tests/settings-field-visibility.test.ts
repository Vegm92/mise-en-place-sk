/**
 * Settings → Review fields: per-restaurant optional-field visibility (issue #880).
 *
 * Not every restaurant wants to see every extracted field on the batch
 * review screen — the due date is the example the issue names as visually
 * distracting for some kitchens. A handful of header fields (supplier,
 * document number, document date, total) stay mandatory; everything else
 * (due date, notes) is optional and can be hidden per restaurant from
 * Settings without touching extraction: the AI keeps detecting the field,
 * only what /batch/[id] renders changes, and the hidden value still rides
 * along as a hidden input so the save action stores it unchanged.
 *
 * Mirrors tests/settings-alert-preferences.test.ts's shape (same settings
 * table, same key-prefix pattern, same DB fixtures) for the load/action half,
 * plus structural assertions on the settings and batch review pages and an
 * i18n parity check. DB-backed cases are skipped without DATABASE_URL.
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
	OPTIONAL_FIELDS,
	defaultFieldVisibility,
	loadFieldVisibility,
	saveFieldVisibility,
} from '../src/lib/server/field-visibility';
import { memoizeEntitlements } from '../src/lib/server/billing';
import { actions, load } from '../src/routes/(app)/settings/+page.server';

const SETTINGS_PAGE = 'src/routes/(app)/settings/+page.svelte';
const BATCH_PAGE = 'src/routes/(app)/batch/[id]/+page.svelte';

let rid = '';
let userId = '';

function locals() {
	return {
		restaurantId: rid,
		user: { id: userId, email: 'field-vis@example.com', name: 'Chef', image: null },
		entitlements: memoizeEntitlements(rid),
		lockedRestaurantIds: [] as string[],
	};
}

async function runAction(body: FormData) {
	const request = new Request('http://localhost/settings?/saveFieldVisibility', { method: 'POST', body });
	return (actions.saveFieldVisibility as (e: unknown) => Promise<{ section?: string; ok?: string }>)({
		request,
		locals: locals(),
	});
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('settings-field-vis');
	rid = r.id;
	const email = `field-vis-${Date.now()}@example.com`;
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

describe('defaultFieldVisibility (issue #880)', () => {
	it('starts every optional field visible', () => {
		const defaults = defaultFieldVisibility();
		for (const field of OPTIONAL_FIELDS) expect(defaults[field]).toBe(true);
	});
});

describe.skipIf(!hasDbEnv)('field visibility load/save round-trip, isolated per tenant (issue #880)', () => {
	it('loads all-visible defaults for a restaurant that never saved anything', async () => {
		const other = await createTestRestaurant('settings-field-vis-fresh');
		try {
			const prefs = await loadFieldVisibility(other.id);
			for (const field of OPTIONAL_FIELDS) expect(prefs[field]).toBe(true);
		} finally {
			await cleanupTestRestaurant(other.id);
		}
	});

	it('persists a hidden field and leaves the other tenant untouched', async () => {
		const other = await createTestRestaurant('settings-field-vis-other');
		try {
			await saveFieldVisibility(rid, { due_date: false });

			const mine = await loadFieldVisibility(rid);
			expect(mine.due_date).toBe(false);
			expect(mine.notes).toBe(true);

			const theirs = await loadFieldVisibility(other.id);
			expect(theirs.due_date).toBe(true);

			await saveFieldVisibility(rid, { due_date: true });
		} finally {
			await cleanupTestRestaurant(other.id);
		}
	});

	it('the settings load exposes the stored visibility and the optional field list', async () => {
		await saveFieldVisibility(rid, { notes: false });

		const data = await (load as (e: unknown) => Promise<Record<string, unknown>>)({ locals: locals() });

		const visibility = data.fieldVisibility as Record<string, boolean>;
		expect(visibility.notes).toBe(false);
		expect(visibility.due_date).toBe(true);

		const optionalFields = data.optionalFields as string[];
		expect(optionalFields.sort()).toEqual([...OPTIONAL_FIELDS].sort());

		await saveFieldVisibility(rid, { notes: true });
	});
});

describe.skipIf(!hasDbEnv)('saveFieldVisibility action (issue #880)', () => {
	it('persists a checked box as visible and an absent box as hidden', async () => {
		const body = new FormData();
		body.append('field_notes', 'on');

		const result = await runAction(body);
		expect(result.section).toBe('campos');

		const prefs = await loadFieldVisibility(rid);
		expect(prefs.notes).toBe(true);
		expect(prefs.due_date).toBe(false);

		await saveFieldVisibility(rid, { due_date: true });
	});

	it("never writes another tenant's visibility", async () => {
		const other = await createTestRestaurant('settings-field-vis-write-other');
		try {
			const body = new FormData();
			await runAction(body);

			const rows = await testSql`
				SELECT key FROM settings WHERE restaurant_id = ${other.id} AND key LIKE 'field_visible_%'`;
			expect(rows).toHaveLength(0);
		} finally {
			await cleanupTestRestaurant(other.id);
		}
	});
});

describe('settings page renders a toggle per optional field (issue #880)', () => {
	const src = readFileSync(SETTINGS_PAGE, 'utf-8');

	it('posts the toggles to the saveFieldVisibility action', () => {
		expect(src).toMatch(/action="\?\/saveFieldVisibility"/);
	});

	it('walks the server-provided optional fields', () => {
		expect(src).toMatch(/#each data\.optionalFields as \w+/);
	});

	it('renders a checkbox toggle bound to the stored visibility', () => {
		expect(src).toMatch(/name=\{`field_\$\{\w+\}`\}/);
		expect(src).toMatch(/checked=\{data\.fieldVisibility\[\w+\]\}/);
	});

	it('labels each toggle through the i18n table', () => {
		expect(src).toMatch(/set\.fields\.label\.\$\{/);
		expect(src).toMatch(/set\.fields\.desc\.\$\{/);
	});
});

describe('batch review honours the visibility flag (issue #880)', () => {
	const src = readFileSync(BATCH_PAGE, 'utf-8');

	it('gates the due-date row behind fieldVisible.due_date', () => {
		expect(src).toMatch(/\{#if fieldVisible\.due_date\}/);
	});

	it('gates the notes row behind fieldVisible.notes', () => {
		expect(src).toMatch(/\{#if fieldVisible\.notes\}/);
	});

	it('still submits due_date and notes as hidden inputs when the row is hidden, keeping the extracted value', () => {
		expect(src).toMatch(/type="hidden" name="due_date" value=\{documentTypeInput/);
		expect(src).toMatch(/type="hidden" name="notes" value=\{notesInput\}/);
	});

	it('derives fieldVisible from the server-provided fieldVisibility map', () => {
		expect(src).toMatch(/const fieldVisible = \$derived\(data\.fieldVisibility/);
	});
});

describe('field visibility labels exist in both locales (issue #880)', () => {
	const keys = [
		'set.fields.title',
		'set.fields.sub',
		'set.fields.saved',
		...OPTIONAL_FIELDS.flatMap((f) => [`set.fields.label.${f}`, `set.fields.desc.${f}`]),
	];

	it.each(['es', 'en'] as const)('has every key in %s', (locale) => {
		const table = translations[locale] as Record<string, string>;
		const missing = keys.filter((k) => !(k in table) || table[k].trim() === '');
		expect(missing).toEqual([]);
	});
});
