/**
 * /api/alert-share — AlertRow's "share this price shock" affordance (issue #329).
 *
 * Reuses the same tokenised, anonymised digest-share mechanism: no
 * ingredient, supplier, or price is ever accepted from the client (the
 * request carries no body at all) and no per-alert state is stored — the
 * endpoint only gets-or-creates the current week's digest_shares token,
 * whose public view already surfaces category-level movers. Skips without
 * DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { resolveShareToken } from '../src/lib/server/digest-share';
import { isoWeek } from '../src/lib/server/weekly-digest';

const describeDb = hasDbEnv ? describe : describe.skip;

function event(rid: string | null) {
	return { locals: { restaurantId: rid } } as never;
}

describeDb('/api/alert-share POST (issue #329)', () => {
	let rid = '';

	beforeAll(async () => {
		if (!hasDbEnv) return;
		rid = (await createTestRestaurant('alert-share')).id;
	});

	afterAll(async () => {
		if (!hasDbEnv) return;
		await cleanupTestRestaurant(rid);
		await closeDb();
	});

	it('rejects an unauthenticated/tenant-less request', async () => {
		const { POST } = await import('../src/routes/(app)/api/alert-share/+server');
		await expect(POST(event(null))).rejects.toMatchObject({ status: 401 });
	});

	it('creates a token for the current week and resolves it to this tenant', async () => {
		const { POST } = await import('../src/routes/(app)/api/alert-share/+server');
		const response = await POST(event(rid));
		const body = await response.json() as { token: string; url: string };

		expect(body.url).toBe(`/s/${body.token}`);
		const resolved = await resolveShareToken(body.token);
		expect(resolved).toEqual({ restaurantId: rid, week: isoWeek(new Date()) });
	});

	it('reuses the same token on a second call within the same week', async () => {
		const { POST } = await import('../src/routes/(app)/api/alert-share/+server');
		const first = await (await POST(event(rid))).json() as { token: string };
		const second = await (await POST(event(rid))).json() as { token: string };
		expect(second.token).toBe(first.token);
	});
});
