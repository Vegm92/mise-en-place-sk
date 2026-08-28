/**
 * Settings → WhatsApp: the manual "add a number" form pre-authorises, it does
 * not bind (issue #498).
 *
 * addWhatsappContact used to call addContact directly — anyone with owner
 * access to any restaurant could type a competitor's number and permanently
 * squat it, with no proof they controlled the handset. It now mints a
 * phone-targeted pairing invitation (issue #320's mechanism, reused): the row
 * in whatsapp_contacts — the table the bot actually routes on — is only ever
 * created by redeemPairingCode, and only for the phone the invite named.
 * "Taken" is also no longer a distinguishable outcome from this action, so a
 * probe can't learn whether a number is already registered to someone else.
 *
 * DB-backed, mirrors settings-add-location.test.ts. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

vi.mock('../src/lib/server/env', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/env')>();
	return { ...actual, WHATSAPP_ACCESS_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_DISPLAY_NUMBER: '' };
});

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { memoizeEntitlements } from '../src/lib/server/billing';
import { actions } from '../src/routes/(app)/settings/+page.server';
import { redeemPairingCode } from '../src/lib/server/whatsapp-pairing';

let ridA = '';
let ridB = '';
let ownerId = '';

function uniquePhone(tag: string) {
	return `346${Date.now().toString().slice(-8)}${tag}`.slice(0, 12);
}

function locals(restaurantId: string) {
	return {
		restaurantId,
		user: { id: ownerId, email: 'wa-owner@example.test', name: 'Chef', image: null },
		entitlements: memoizeEntitlements(restaurantId),
		lockedRestaurantIds: [] as string[],
	};
}

type ActionResult =
	| { kind: 'fail'; status: number; data: Record<string, unknown> }
	| { kind: 'ok'; value: unknown };

async function runAction(
	actionName: 'addWhatsappContact' | 'removeWhatsappContact',
	body: FormData,
	restaurantId: string,
): Promise<ActionResult> {
	const request = new Request(`http://localhost/settings?/${actionName}`, { method: 'POST', body });
	const value = await (actions[actionName] as (e: unknown) => Promise<unknown>)({ request, locals: locals(restaurantId) });
	if (value && typeof value === 'object' && 'status' in value && 'data' in value) {
		const v = value as { status: number; data: Record<string, unknown> };
		return { kind: 'fail', status: v.status, data: v.data };
	}
	return { kind: 'ok', value };
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	ridA = (await createTestRestaurant('wa-invite-a')).id;
	ridB = (await createTestRestaurant('wa-invite-b')).id;

	const email = `wa-invite-owner-${Date.now()}@example.com`;
	const [user] = await testSql`INSERT INTO users (email, name) VALUES (${email}, ${'Chef'}) RETURNING id`;
	ownerId = user.id;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${ownerId}, ${ridA}, 'owner')`;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${ownerId}, ${ridB}, 'owner')`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(ridA);
	await cleanupTestRestaurant(ridB);
	if (ownerId) await testSql`DELETE FROM users WHERE id = ${ownerId}`;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('addWhatsappContact pre-authorises instead of binding (issue #498)', () => {
	it('creates a phone-targeted pairing invite, not a whatsapp_contacts row', async () => {
		const phone = uniquePhone('01');
		const body = new FormData();
		body.append('phone', phone);
		body.append('name', 'Chef García');

		const result = await runAction('addWhatsappContact', body, ridA);
		expect(result.kind).toBe('ok');

		expect(await testSql`SELECT id FROM whatsapp_contacts WHERE phone_number = ${phone}`).toHaveLength(0);

		const invites = await testSql`
			SELECT restaurant_id, phone_number, redeemed_at FROM whatsapp_pairing_codes WHERE phone_number = ${phone}
		`;
		expect(invites).toHaveLength(1);
		expect(invites[0].restaurant_id).toBe(ridA);
		expect(invites[0].redeemed_at).toBeNull();
	});

	it('never returns a distinguishable "taken" outcome, even for a number already bound elsewhere', async () => {
		const phone = uniquePhone('02');
		await testSql`INSERT INTO whatsapp_contacts (restaurant_id, phone_number) VALUES (${ridB}, ${phone})`;

		const body = new FormData();
		body.append('phone', phone);
		body.append('name', '');

		// Same shape as inviting a fresh, unclaimed number — nothing here
		// confirms the number is already registered to another restaurant.
		const result = await runAction('addWhatsappContact', body, ridA);
		expect(result.kind).toBe('ok');
	});

	it('only becomes a routable binding once redeemed from the invited phone', async () => {
		const phone = uniquePhone('03');
		const body = new FormData();
		body.append('phone', phone);
		body.append('name', 'Chef García');
		await runAction('addWhatsappContact', body, ridA);

		const [invite] = await testSql`
			SELECT code FROM whatsapp_pairing_codes WHERE phone_number = ${phone} AND redeemed_at IS NULL
		`;
		expect(invite).toBeDefined();

		const mismatch = await redeemPairingCode('34699999999', invite.code as string);
		expect(mismatch).toEqual({ ok: false, reason: 'invalid' });
		expect(await testSql`SELECT id FROM whatsapp_contacts WHERE phone_number = ${phone}`).toHaveLength(0);

		const redeemed = await redeemPairingCode(phone, invite.code as string);
		expect(redeemed).toEqual({ ok: true, restaurantId: ridA });
		expect(await testSql`SELECT id FROM whatsapp_contacts WHERE phone_number = ${phone}`).toHaveLength(1);
	});
});

describe.skipIf(!hasDbEnv)('removeWhatsappContact releases and audits (issue #498)', () => {
	it('frees the number for another tenant and writes an audit row', async () => {
		const phone = uniquePhone('04');
		const [contact] = await testSql`
			INSERT INTO whatsapp_contacts (restaurant_id, phone_number) VALUES (${ridA}, ${phone}) RETURNING id
		`;

		const body = new FormData();
		body.append('id', String(contact.id));
		const result = await runAction('removeWhatsappContact', body, ridA);
		expect(result.kind).toBe('ok');

		expect(await testSql`SELECT id FROM whatsapp_contacts WHERE phone_number = ${phone}`).toHaveLength(0);

		const audit = await testSql`
			SELECT restaurant_id, notification_type, payload FROM system_notifications
			WHERE restaurant_id = ${ridA} AND notification_type = 'whatsapp_contact_released'
			ORDER BY created_at DESC LIMIT 1
		`;
		expect(audit).toHaveLength(1);
		const payload = JSON.parse(audit[0].payload as string);
		expect(payload).toMatchObject({ phoneNumber: phone, method: 'owner', releasedBy: ownerId });

		const inviteBody = new FormData();
		inviteBody.append('phone', phone);
		inviteBody.append('name', '');
		await runAction('addWhatsappContact', inviteBody, ridB);
		const [invite] = await testSql`
			SELECT code FROM whatsapp_pairing_codes
			WHERE phone_number = ${phone} AND redeemed_at IS NULL
			ORDER BY created_at DESC LIMIT 1
		`;
		const redeemed = await redeemPairingCode(phone, invite.code as string);
		expect(redeemed).toEqual({ ok: true, restaurantId: ridB });
	});
});
