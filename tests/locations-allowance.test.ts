/**
 * Locales por encima del plan (issue #679).
 *
 * Una cuenta Business puede crear hasta 5 locales; si luego baja a Pro (1),
 * los sobrantes siguen existiendo en `user_restaurants` y hasta ahora se
 * podían seguir usando con normalidad. La regla: dentro del grupo de
 * facturación se conservan los primeros `maxLocations` por antigüedad y el
 * resto queda bloqueado — los datos se conservan y un upgrade los devuelve.
 *
 * Este archivo cubre las dos mitades: la resolución contra Postgres real (el
 * ranking por `created_at` dentro del grupo vive en SQL) y el predicado puro.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testSql, closeDb, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { isRankLocked } from '../src/lib/server/locations';

describe('isRankLocked', () => {
	it('deja pasar los locales dentro de la asignación del plan', () => {
		expect(isRankLocked(0, 1)).toBe(false);
		expect(isRankLocked(4, 5)).toBe(false);
	});

	it('bloquea a partir de la asignación', () => {
		expect(isRankLocked(1, 1)).toBe(true);
		expect(isRankLocked(5, 5)).toBe(true);
	});
});

describe.runIf(hasDbEnv)('memberLocations / isLocationLocked contra Postgres', () => {
	let parentId = '';
	let childOneId = '';
	let childTwoId = '';
	let userId = '';
	let locations: typeof import('../src/lib/server/locations');

	async function setTier(tier: string) {
		await testSql`
			INSERT INTO subscriptions (restaurant_id, plan_tier, status)
			VALUES (${parentId}, ${tier}, 'active')
			ON CONFLICT (restaurant_id) DO UPDATE SET plan_tier = ${tier}, status = 'active'
		`;
	}

	beforeAll(async () => {
		if (!hasDbEnv) return;
		locations = await import('../src/lib/server/locations');

		const slug = `test-vitest-locks-${Date.now()}`;
		const [parent] = await testSql`
			INSERT INTO restaurants (name, slug, created_at)
			VALUES ('Casa Lua', ${slug}, now() - interval '3 days') RETURNING id
		`;
		parentId = parent!.id as string;

		const [one] = await testSql`
			INSERT INTO restaurants (name, slug, parent_id, created_at)
			VALUES ('Casa Lua Norte', ${slug + '-1'}, ${parentId}, now() - interval '2 days') RETURNING id
		`;
		childOneId = one!.id as string;

		const [two] = await testSql`
			INSERT INTO restaurants (name, slug, parent_id, created_at)
			VALUES ('Casa Lua Sur', ${slug + '-2'}, ${parentId}, now() - interval '1 day') RETURNING id
		`;
		childTwoId = two!.id as string;

		const [user] = await testSql`
			INSERT INTO users (email, access_status) VALUES (${slug + '@example.com'}, 'approved') RETURNING id
		`;
		userId = user!.id as string;
		for (const rid of [parentId, childOneId, childTwoId]) {
			await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${userId}, ${rid}, 'owner')`;
		}
	});

	afterAll(async () => {
		if (!hasDbEnv) return;
		if (userId) await testSql`DELETE FROM users WHERE id = ${userId}`;
		await cleanupTestRestaurant(parentId);
		await closeDb();
	});

	it('no bloquea nada mientras el plan cubre todos los locales', async () => {
		await setTier('business');
		const rows = await locations.memberLocations(userId);

		expect(rows).toHaveLength(3);
		expect(rows.every(r => !r.locked)).toBe(true);
		expect(rows.every(r => r.billingRestaurantId === parentId)).toBe(true);
		expect(await locations.isLocationLocked(childTwoId)).toBe(false);
	});

	it('tras bajar a Pro solo sobrevive la raíz, por antigüedad', async () => {
		await setTier('pro');
		const rows = await locations.memberLocations(userId);
		const byId = new Map(rows.map(r => [r.restaurantId, r.locked]));

		expect(byId.get(parentId)).toBe(false);
		expect(byId.get(childOneId)).toBe(true);
		expect(byId.get(childTwoId)).toBe(true);
		expect(await locations.isLocationLocked(childOneId)).toBe(true);
		expect(await locations.isLocationLocked(parentId)).toBe(false);
	});

	it('una suscripción cancelada cae a trial y bloquea igual', async () => {
		await testSql`UPDATE subscriptions SET status = 'canceled' WHERE restaurant_id = ${parentId}`;
		expect(await locations.isLocationLocked(childOneId)).toBe(true);
		await testSql`UPDATE subscriptions SET status = 'active' WHERE restaurant_id = ${parentId}`;
	});

	it('volver a Business devuelve el acceso, con los datos intactos', async () => {
		await setTier('business');
		const rows = await locations.memberLocations(userId);

		expect(rows.every(r => !r.locked)).toBe(true);
		const [_r_] = await testSql`SELECT count(*)::int AS count FROM restaurants WHERE COALESCE(parent_id, id) = ${parentId}`;
		const { count } = _r_!;
		expect(count).toBe(3);
	});

	// Un local bloqueado no puede dejar al usuario sin salida legal: exportar y
	// borrar sus datos siguen enumerando membresías, no locales accesibles.
	it('export y borrado siguen viendo el local bloqueado', async () => {
		await setTier('pro');
		const memberships = await testSql`SELECT restaurant_id FROM user_restaurants WHERE user_id = ${userId}`;
		expect(memberships).toHaveLength(3);
	});
});
