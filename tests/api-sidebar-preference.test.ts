/**
 * Sidebar collapse preference — settings-table write (issue #567).
 *
 * The sidebar collapse toggle needs to survive a cleared localStorage / a new
 * device, so the toggle fires a small fire-and-forget POST at
 * /(app)/api/sidebar (mirroring the tutorial_step endpoint) that upserts the
 * `sidebar_collapsed` settings key. These tests cover the write in isolation
 * — the read half (folded into the merged settings query) is covered by
 * tests/app-layout-load.test.ts.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped
 * without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { POST } from '../src/routes/(app)/api/sidebar/+server';

let rid = '';

function locals() {
	return { restaurantId: rid };
}

async function runPost(body: unknown) {
	const request = new Request('http://localhost/api/sidebar', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	try {
		const res = await (POST as (e: unknown) => Promise<Response>)({ request, locals: locals() });
		return { ok: true as const, res };
	} catch (thrown) {
		return { ok: false as const, thrown: thrown as { status?: number; body?: { message?: string } } };
	}
}

async function storedValue(): Promise<string | null> {
	const rows = await testSql`
		SELECT value FROM settings WHERE restaurant_id = ${rid} AND key = 'sidebar_collapsed'`;
	return rows[0]?.value ?? null;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('api-sidebar-pref');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('POST /(app)/api/sidebar (issue #567)', () => {
	it('inserts the collapsed preference on first write', async () => {
		const result = await runPost({ collapsed: true });
		expect(result.ok).toBe(true);
		expect(await storedValue()).toBe('true');
	});

	it('upserts on a later write instead of duplicating the row', async () => {
		await runPost({ collapsed: true });
		const result = await runPost({ collapsed: false });
		expect(result.ok).toBe(true);
		expect(await storedValue()).toBe('false');

		const rows = await testSql`
			SELECT count(*)::int AS n FROM settings WHERE restaurant_id = ${rid} AND key = 'sidebar_collapsed'`;
		expect(rows[0].n).toBe(1);
	});

	it('rejects a request with no tenant on locals', async () => {
		const request = new Request('http://localhost/api/sidebar', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ collapsed: true }),
		});
		await expect(
			(POST as (e: unknown) => Promise<Response>)({ request, locals: { restaurantId: undefined } })
		).rejects.toMatchObject({ status: 401 });
	});

	it('rejects a non-boolean collapsed value', async () => {
		const result = await runPost({ collapsed: 'yes' });
		expect(result.ok).toBe(false);
		expect(result.thrown?.status).toBe(400);
	});
});
