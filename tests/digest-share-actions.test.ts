/**
 * /reports/[type] digest share/revokeShare actions — issue #329.
 *
 * Tenant-scoped by construction: both actions read the restaurant id only
 * from `locals.restaurantId` (never from client input), so there is no id
 * a caller could pass to target another tenant's share. These tests pin the
 * create/reuse/revoke lifecycle and that two tenants never see each other's
 * tokens. Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { resolveShareToken } from '../src/lib/server/digest-share';

const describeDb = hasDbEnv ? describe : describe.skip;

function event(rid: string | null) {
	return { locals: { restaurantId: rid } } as never;
}

describeDb('digest share create/revoke actions (issue #329)', () => {
	let ridA = '';
	let ridB = '';

	beforeAll(async () => {
		if (!hasDbEnv) return;
		ridA = (await createTestRestaurant('digest-share-act-a')).id;
		ridB = (await createTestRestaurant('digest-share-act-b')).id;
	});

	afterAll(async () => {
		if (!hasDbEnv) return;
		await testSql`DELETE FROM digest_shares WHERE restaurant_id IN (${ridA}, ${ridB})`;
		await cleanupTestRestaurant(ridA);
		await cleanupTestRestaurant(ridB);
		await closeDb();
	});

	it('rejects a missing tenant', async () => {
		const { actions } = await import('../src/routes/(app)/reports/[type]/+page.server');
		const result = await actions.share(event(null));
		expect(result).toMatchObject({ status: 401 });
	});

	it('creates a token on first share and reuses it on a second call (same week)', async () => {
		const { actions } = await import('../src/routes/(app)/reports/[type]/+page.server');
		const first = await actions.share(event(ridA)) as { shareToken: string; shareWeek: string };
		expect(first.shareToken).toBeTruthy();

		const second = await actions.share(event(ridA)) as { shareToken: string };
		expect(second.shareToken).toBe(first.shareToken);

		const rows = await testSql`SELECT token FROM digest_shares WHERE restaurant_id = ${ridA} AND revoked_at IS NULL`;
		expect(rows.length).toBe(1);
	});

	it('revoking sets revoked_at and the token 404s (resolves null) afterwards', async () => {
		const { actions } = await import('../src/routes/(app)/reports/[type]/+page.server');
		const created = await actions.share(event(ridB)) as { shareToken: string };
		expect(await resolveShareToken(created.shareToken)).not.toBeNull();

		const revoked = await actions.revokeShare(event(ridB)) as { shareRevoked: boolean };
		expect(revoked.shareRevoked).toBe(true);
		expect(await resolveShareToken(created.shareToken)).toBeNull();
	});

	it('sharing again after a revoke issues a fresh token, not the revoked one', async () => {
		const { actions } = await import('../src/routes/(app)/reports/[type]/+page.server');
		const rows = await testSql`SELECT token FROM digest_shares WHERE restaurant_id = ${ridB} ORDER BY created_at DESC LIMIT 1`;
		const revokedToken = rows[0]?.token as string;

		const fresh = await actions.share(event(ridB)) as { shareToken: string };
		expect(fresh.shareToken).not.toBe(revokedToken);
		expect(await resolveShareToken(fresh.shareToken)).not.toBeNull();
	});

	it('two tenants never share or leak each other\'s tokens', async () => {
		const rowsA = await testSql`SELECT token FROM digest_shares WHERE restaurant_id = ${ridA}`;
		const rowsB = await testSql`SELECT token FROM digest_shares WHERE restaurant_id = ${ridB}`;
		const tokensA = new Set(rowsA.map((r) => r.token));
		const tokensB = new Set(rowsB.map((r) => r.token));
		for (const t of tokensA) expect(tokensB.has(t)).toBe(false);

		const resolvedA = await resolveShareToken([...tokensA][0] as string);
		expect(resolvedA?.restaurantId).toBe(ridA);
		expect(resolvedA?.restaurantId).not.toBe(ridB);
	});
});
