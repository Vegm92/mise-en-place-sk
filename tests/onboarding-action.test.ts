/**
 * Onboarding action — segmentation (issue #328) + the #241/#250 idempotency
 * machinery it must not weaken.
 *
 * DB-backed against local Postgres (the advisory-xact-lock + idempotency-key
 * dance only means something against a real transaction). Skipped without
 * DATABASE_URL. `sendEmail`/`welcomeEmail` are mocked so we can assert what
 * segment gets stamped without touching Resend.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

const { sendEmailMock, welcomeEmailMock } = vi.hoisted(() => ({
	sendEmailMock: vi.fn(async () => {}),
	welcomeEmailMock: vi.fn((email: string, name?: string, venueType?: string | null) => ({
		to: email,
		subject: 'welcome',
		html: `<p>${name}/${venueType ?? 'none'}</p>`,
		kind: 'welcome' as const,
	})),
}));

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	return { db: testDb, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});
vi.mock('$lib/server/email', () => ({
	sendEmail: sendEmailMock,
	welcomeEmail: welcomeEmailMock,
}));

import { actions, load } from '../src/routes/onboarding/+page.server';
import { userRestaurants, restaurants, subscriptions } from '../src/lib/server/schema';
import { testDb, testSql, closeDb, hasDbEnv } from './helpers/test-db';

function formEvent(fields: Record<string, string>, opts: { userId: string; email: string; attrCookie?: string }) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	return {
		request: { formData: async () => data },
		locals: { user: { id: opts.userId, email: opts.email } },
		cookies: { get: (name: string) => (name === 'mep_attr' ? opts.attrCookie : undefined) },
	} as never;
}

async function runOnboard(event: unknown): Promise<number | null> {
	try {
		await actions.default!(event as never);
		return null;
	} catch (e) {
		if (isRedirect(e)) return e.status;
		throw e;
	}
}

async function insertTestUser(founder = false) {
	const email = `onboard-${randomUUID()}@example.test`;
	const [row] = await testSql`
		INSERT INTO users (email, founder) VALUES (${email}, ${founder}) RETURNING id
	`;
	return { id: row!.id as string, email };
}

async function restaurantForUser(userId: string) {
	const [membership] = await testDb.select({ restaurantId: userRestaurants.restaurantId })
		.from(userRestaurants).where(eq(userRestaurants.userId, userId));
	if (!membership) return null;
	const [row] = await testDb.select().from(restaurants).where(eq(restaurants.id, membership.restaurantId));
	return row ?? null;
}

async function cleanupUser(userId: string) {
	const rows = await testDb.select({ restaurantId: userRestaurants.restaurantId })
		.from(userRestaurants).where(eq(userRestaurants.userId, userId));
	for (const r of rows) await testSql`DELETE FROM restaurants WHERE id = ${r.restaurantId}`;
	await testSql`DELETE FROM users WHERE id = ${userId}`;
}

beforeEach(() => {
	sendEmailMock.mockClear();
	welcomeEmailMock.mockClear();
});

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

describe.skipIf(!hasDbEnv)('onboarding action — #328 segmentation fields', () => {
	let userId = '';
	let email = '';

	afterEach(async () => {
		if (userId) await cleanupUser(userId);
		userId = '';
	});

	it('persists venueType/topCategory/acquisitionSource/acquisitionVariant inside the same transaction', async () => {
		({ id: userId, email } = await insertTestUser());

		const cookie = JSON.stringify({ source: 'google', campaign: null, variant: 'menu-del-dia', segment: null, referrer: null, landingPath: null, referredBy: null });
		const status = await runOnboard(formEvent(
			{ name: 'Casa Segmentada', venueType: 'menu_del_dia', topCategory: 'Bebidas', terms: 'on', idempotency_key: randomUUID() },
			{ userId, email, attrCookie: cookie },
		));
		expect(status).toBe(303);

		const row = await restaurantForUser(userId);
		expect(row?.venueType).toBe('menu_del_dia');
		expect(row?.topCategory).toBe('Bebidas');
		expect(row?.acquisitionSource).toBe('google');
		expect(row?.acquisitionVariant).toBe('menu-del-dia');

		expect(welcomeEmailMock).toHaveBeenCalledWith(email, 'Casa Segmentada', 'menu_del_dia');
	});

	it('rejects an unknown venueType/topCategory to null instead of erroring', async () => {
		({ id: userId, email } = await insertTestUser());

		const status = await runOnboard(formEvent(
			{ name: 'Casa Invalida', venueType: 'spaceship', topCategory: 'Not A Real Category', terms: 'on', idempotency_key: randomUUID() },
			{ userId, email },
		));
		expect(status).toBe(303);

		const row = await restaurantForUser(userId);
		expect(row?.venueType).toBeNull();
		expect(row?.topCategory).toBeNull();
	});

	it('stamps null acquisitionSource/acquisitionVariant when there is no mep_attr cookie', async () => {
		({ id: userId, email } = await insertTestUser());

		const status = await runOnboard(formEvent(
			{ name: 'Casa Sin Cookie', terms: 'on', idempotency_key: randomUUID() },
			{ userId, email },
		));
		expect(status).toBe(303);

		const row = await restaurantForUser(userId);
		expect(row?.acquisitionSource).toBeNull();
		expect(row?.acquisitionVariant).toBeNull();
		expect(row?.venueType).toBeNull();
	});

	it('leaves venueType/topCategory/acquisition* null-safe (renders every screen without error) — the columns default to null with no name field constraints on them', async () => {
		({ id: userId, email } = await insertTestUser());
		await runOnboard(formEvent({ name: 'Casa Minima', terms: 'on', idempotency_key: randomUUID() }, { userId, email }));

		const row = await restaurantForUser(userId);
		expect(row?.venueType).toBeNull();
		expect(row?.city).toBeNull();
		expect(row?.topCategory).toBeNull();
	});
});

describe.skipIf(!hasDbEnv)('onboarding action — double-submit idempotency is unweakened (#241/#250)', () => {
	let userId = '';
	let email = '';

	afterEach(async () => {
		if (userId) await cleanupUser(userId);
		userId = '';
	});

	it('concurrent double-submit with the same idempotency key creates exactly one restaurant/trial/welcome email', async () => {
		({ id: userId, email } = await insertTestUser());

		const idemKey = randomUUID();
		const fields = { name: 'Casa Doble', venueType: 'grupo', terms: 'on', idempotency_key: idemKey };
		const [statusA, statusB] = await Promise.all([
			runOnboard(formEvent(fields, { userId, email })),
			runOnboard(formEvent(fields, { userId, email })),
		]);
		expect(statusA).toBe(303);
		expect(statusB).toBe(303);

		const restaurantRows = await testDb.select().from(userRestaurants).where(eq(userRestaurants.userId, userId));
		expect(restaurantRows).toHaveLength(1);

		const subRows = await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, restaurantRows[0]!.restaurantId));
		expect(subRows).toHaveLength(1);

		expect(welcomeEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
	});
});

describe.skipIf(!hasDbEnv)('onboarding load — landing-variant venueType preselection (#328)', () => {
	it('preselects venueType from a mapped landing variant cookie, user-overridable in the form', async () => {
		const { id: userId, email } = await insertTestUser();
		try {
			const cookie = JSON.stringify({ source: null, campaign: null, variant: 'menu-del-dia', segment: null, referrer: null, landingPath: null, referredBy: null });
			const data = await load({
				locals: { user: { id: userId, email } },
				url: new URL('https://app.example.test/onboarding'),
				cookies: { get: (name: string) => (name === 'mep_attr' ? cookie : undefined) },
			} as never);
			expect(data).toMatchObject({ prefillVenueType: 'menu_del_dia' });
		} finally {
			await cleanupUser(userId);
		}
	});

	it('preselects grupo for the grupo-multi-local variant', async () => {
		const { id: userId, email } = await insertTestUser();
		try {
			const cookie = JSON.stringify({ source: null, campaign: null, variant: 'grupo-multi-local', segment: null, referrer: null, landingPath: null, referredBy: null });
			const data = await load({
				locals: { user: { id: userId, email } },
				url: new URL('https://app.example.test/onboarding'),
				cookies: { get: (name: string) => (name === 'mep_attr' ? cookie : undefined) },
			} as never);
			expect(data).toMatchObject({ prefillVenueType: 'grupo' });
		} finally {
			await cleanupUser(userId);
		}
	});

	it('does not preselect anything for an unmapped landing variant', async () => {
		const { id: userId, email } = await insertTestUser();
		try {
			const cookie = JSON.stringify({ source: null, campaign: null, variant: 'aceite-de-oliva', segment: null, referrer: null, landingPath: null, referredBy: null });
			const data = await load({
				locals: { user: { id: userId, email } },
				url: new URL('https://app.example.test/onboarding'),
				cookies: { get: (name: string) => (name === 'mep_attr' ? cookie : undefined) },
			} as never);
			expect(data).toMatchObject({ prefillVenueType: null });
		} finally {
			await cleanupUser(userId);
		}
	});

	it('does not preselect anything with no attribution cookie at all', async () => {
		const { id: userId, email } = await insertTestUser();
		try {
			const data = await load({
				locals: { user: { id: userId, email } },
				url: new URL('https://app.example.test/onboarding'),
				cookies: { get: () => undefined },
			} as never);
			expect(data).toMatchObject({ prefillVenueType: null });
		} finally {
			await cleanupUser(userId);
		}
	});
});
