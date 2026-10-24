/**
 * Settings route — the actions and load paths no other file pins (issue #1275).
 *
 * Phase 6 moves the settings route's business logic into server modules, so
 * every action must be reachable from a route-level test before it moves:
 * resetTutorial, the two pairing-code actions, the alert thresholds, the
 * load's threshold read, and the /api/tutorial write that shares the
 * `settings` table with them.
 *
 * DB-backed, mirrors settings-whatsapp-invite.test.ts. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: <T>(fn: () => T) => fn(), runWithTenantContext: <T>(_id: string, fn: () => T) => fn() };
});

vi.mock('../src/lib/server/env', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/env')>();
	return { ...actual, WHATSAPP_ACCESS_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_DISPLAY_NUMBER: '' };
});

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { memoizeEntitlements } from '../src/lib/server/billing';
import { actions, load } from '../src/routes/(app)/settings/+page.server';
import { POST as postTutorial } from '../src/routes/(app)/api/tutorial/+server';

let rid = '';
let ownerId = '';
let memberId = '';
let actingUserId = '';

function locals() {
	return {
		restaurantId: rid,
		user: { id: actingUserId, email: 'route-actions@example.test', name: 'Chef', image: null },
		entitlements: memoizeEntitlements(rid),
		lockedRestaurantIds: [] as string[],
	};
}

type ActionName =
	| 'resetTutorial'
	| 'saveAlertPreferences'
	| 'generateWhatsappPairingCode'
	| 'revokeWhatsappPairingCode';

type Outcome =
	| { kind: 'fail'; status: number; data: Record<string, unknown> }
	| { kind: 'ok'; value: Record<string, unknown> }
	| { kind: 'redirect'; status: number; location: string };

async function run(name: ActionName, fields: Record<string, string> = {}): Promise<Outcome> {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.append(k, v);
	const request = new Request(`http://localhost/settings?/${name}`, { method: 'POST', body });
	try {
		const value = (await (actions[name] as (e: unknown) => Promise<unknown>)({ request, locals: locals() })) as
			| Record<string, unknown>
			| undefined;
		if (value && 'status' in value && 'data' in value) {
			return { kind: 'fail', status: value.status as number, data: value.data as Record<string, unknown> };
		}
		return { kind: 'ok', value: value ?? {} };
	} catch (thrown) {
		const r = thrown as { status?: number; location?: string };
		if (r.location) return { kind: 'redirect', status: r.status ?? 0, location: r.location };
		throw thrown;
	}
}

async function stored(key: string): Promise<string | null> {
	const rows = await testSql`SELECT value FROM settings WHERE restaurant_id = ${rid} AND key = ${key}`;
	return rows[0]?.value ?? null;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('settings-route-actions')).id;
	const stamp = Date.now();
	const [owner] = await testSql`INSERT INTO users (email, name) VALUES (${`route-owner-${stamp}@example.com`}, 'Chef') RETURNING id`;
	const [member] = await testSql`INSERT INTO users (email, name) VALUES (${`route-member-${stamp}@example.com`}, 'Cook') RETURNING id`;
	ownerId = owner!.id;
	memberId = member!.id;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${ownerId}, ${rid}, 'owner')`;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${memberId}, ${rid}, 'member')`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	for (const id of [ownerId, memberId]) if (id) await testSql`DELETE FROM users WHERE id = ${id}`;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('resetTutorial', () => {
	it('rewinds the tutorial to step 1 and sends the user to the dashboard', async () => {
		actingUserId = ownerId;
		await testSql`
			INSERT INTO settings (restaurant_id, key, value) VALUES (${rid}, 'tutorial_step', 'done')
			ON CONFLICT (restaurant_id, key) DO UPDATE SET value = 'done'`;

		const out = await run('resetTutorial');

		expect(out).toEqual({ kind: 'redirect', status: 303, location: '/' });
		expect(await stored('tutorial_step')).toBe('1');
	});
});

describe.skipIf(!hasDbEnv)('saveAlertPreferences thresholds', () => {
	it('stores the budget threshold as a whole percent and the price threshold as a fraction', async () => {
		actingUserId = ownerId;
		const out = await run('saveAlertPreferences', { threshold: '70', priceThreshold: '25' });

		expect(out).toEqual({ kind: 'redirect', status: 303, location: '/settings' });
		expect(await stored('budget_warning_threshold')).toBe('70');
		expect(await stored('price_alert_threshold')).toBe('0.25');
	});

	it('clamps out-of-range thresholds into 1..99 and falls back on junk', async () => {
		actingUserId = ownerId;
		await run('saveAlertPreferences', { threshold: '500', priceThreshold: '-3' });
		expect(await stored('budget_warning_threshold')).toBe('99');
		expect(await stored('price_alert_threshold')).toBe('0.01');

		await run('saveAlertPreferences', { threshold: 'abc', priceThreshold: '' });
		expect(await stored('budget_warning_threshold')).toBe('80');
		expect(await stored('price_alert_threshold')).toBe('0.15');
	});

	it('leaves a stored threshold alone when the form omits the field', async () => {
		actingUserId = ownerId;
		await run('saveAlertPreferences', { threshold: '60', priceThreshold: '30' });
		await run('saveAlertPreferences', {});
		expect(await stored('budget_warning_threshold')).toBe('60');
		expect(await stored('price_alert_threshold')).toBe('0.30');
	});
});

describe.skipIf(!hasDbEnv)('settings load thresholds', () => {
	it('reads the stored thresholds back as percentages', async () => {
		actingUserId = ownerId;
		await run('saveAlertPreferences', { threshold: '65', priceThreshold: '12' });

		const data = await (load as (e: unknown) => Promise<Record<string, unknown>>)({ locals: locals() });

		expect(data.threshold).toBe(65);
		expect(data.priceThreshold).toBe(12);
	});

	it('defaults to 80 and 15 when nothing was saved', async () => {
		actingUserId = ownerId;
		await testSql`DELETE FROM settings WHERE restaurant_id = ${rid} AND key IN ('budget_warning_threshold', 'price_alert_threshold')`;

		const data = await (load as (e: unknown) => Promise<Record<string, unknown>>)({ locals: locals() });

		expect(data.threshold).toBe(80);
		expect(data.priceThreshold).toBe(15);
	});
});

describe.skipIf(!hasDbEnv)('generateWhatsappPairingCode', () => {
	it('mints an unredeemed code for the active restaurant', async () => {
		actingUserId = ownerId;
		const out = await run('generateWhatsappPairingCode', { name: 'Chef García' });

		expect(out).toEqual({ kind: 'ok', value: { section: 'whatsapp', ok: 'set.whatsapp.ok.pairGenerated' } });
		const rows = await testSql`
			SELECT redeemed_at FROM whatsapp_pairing_codes WHERE restaurant_id = ${rid} AND redeemed_at IS NULL`;
		expect(rows.length).toBeGreaterThan(0);
	});

	it('rejects a non-owner with 403 and mints nothing', async () => {
		actingUserId = memberId;
		await testSql`DELETE FROM whatsapp_pairing_codes WHERE restaurant_id = ${rid}`;

		const out = await run('generateWhatsappPairingCode', { name: 'Cook' });

		expect(out).toMatchObject({ kind: 'fail', status: 403, data: { section: 'whatsapp', error: 'set.whatsapp.err.notOwner' } });
		expect(await testSql`SELECT 1 FROM whatsapp_pairing_codes WHERE restaurant_id = ${rid}`).toHaveLength(0);
	});

	it('rejects an over-long name with 422', async () => {
		actingUserId = ownerId;
		const out = await run('generateWhatsappPairingCode', { name: 'x'.repeat(81) });
		expect(out).toMatchObject({ kind: 'fail', status: 422, data: { error: 'set.whatsapp.err.nameTooLong' } });
	});
});

describe.skipIf(!hasDbEnv)('revokeWhatsappPairingCode', () => {
	it('removes the active code for an owner', async () => {
		actingUserId = ownerId;
		await run('generateWhatsappPairingCode', { name: 'Chef' });

		const out = await run('revokeWhatsappPairingCode');

		expect(out).toEqual({ kind: 'ok', value: { section: 'whatsapp', ok: 'set.whatsapp.ok.pairRevoked' } });
		expect(
			await testSql`
				SELECT 1 FROM whatsapp_pairing_codes
				WHERE restaurant_id = ${rid} AND redeemed_at IS NULL AND expires_at > now()`,
		).toHaveLength(0);
	});

	it('rejects a non-owner with 403', async () => {
		actingUserId = memberId;
		const out = await run('revokeWhatsappPairingCode');
		expect(out).toMatchObject({ kind: 'fail', status: 403, data: { error: 'set.whatsapp.err.notOwner' } });
	});
});

describe.skipIf(!hasDbEnv)('POST /(app)/api/tutorial', () => {
	async function post(body: unknown, restaurantId: string | null = rid) {
		const request = new Request('http://localhost/api/tutorial', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		return (postTutorial as (e: unknown) => Promise<Response>)({ request, locals: { restaurantId } });
	}

	it('upserts the step under the caller tenant', async () => {
		expect((await post({ step: '4' })).status).toBe(200);
		expect(await stored('tutorial_step')).toBe('4');
		expect((await post({ step: 'dismissed' })).status).toBe(200);
		expect(await stored('tutorial_step')).toBe('dismissed');
		const rows = await testSql`SELECT 1 FROM settings WHERE restaurant_id = ${rid} AND key = 'tutorial_step'`;
		expect(rows).toHaveLength(1);
	});

	it('rejects an unknown step and a missing tenant', async () => {
		expect((await post({ step: '99' })).status).toBe(400);
		expect((await post({ step: '2' }, null)).status).toBe(401);
	});
});
