/**
 * Regression tests for issue #425 — /api/health's queue-depth probe and the
 * admin dashboard's "in flight" tile used to read `upload_sessions`, a table
 * nothing wrote to since the pipeline moved to `upload_batches` / `batch_items`
 * (ADR-015). Both always reported zero as a result. `upload_sessions` itself
 * was dropped in issue #514.
 *
 * These prove the counts come from real `batch_items` rows in the
 * 'queued'/'extracting' states, and are computed against a captured baseline
 * rather than an absolute number so a shared test database with residue from
 * other suites cannot make this pass by accident.
 *
 * `$lib/server/db` is redirected at the shared test connection, like the
 * other DB-backed suites. Skipped when the DB gate is closed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { testDb, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { createBatchStore } from '../src/lib/server/batch';

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return {
		db: testDb,
		getDb: () => testDb,
		forTenant,
		runAsSystem: (fn: () => unknown) => fn(),
		runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn(),
	};
});

vi.mock('$lib/server/admin', () => ({ isAdminUser: () => true }));

let rid = '';
const store = hasDbEnv ? createBatchStore(testDb) : null!;

function adminHealthEvent() {
	return {
		request: new Request('http://localhost/api/health'),
		locals: { user: { id: 'admin', email: 'admin@example.com', name: null, image: null } },
		getClientAddress: () => '203.0.113.9',
	} as never;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('queue-depth')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid); // batches/items cascade
	await closeDb();
});

describe.skipIf(!hasDbEnv)('#425 — /api/health counts batch_items, not upload_sessions', () => {
	it('active_count rises by exactly the queued/extracting items just created', async () => {
		const { GET } = await import('../src/routes/api/health/+server');

		const baseline = ((await (await GET(adminHealthEvent())).json()) as { sessions: { active_count: number } })
			.sessions.active_count;

		const { itemIds: [a, b] } = await store.createBatch(rid, [
			{ key: 'ns/a.pdf', name: 'a.pdf' },
			{ key: 'ns/b.pdf', name: 'b.pdf' },
			{ key: 'ns/c.pdf', name: 'c.pdf' },
		]);
		await store.markQueued(a);
		await store.markQueued(b);
		await store.markExtracting(b);
		// the third item (ns/c.pdf) is left pending — it must not count

		const after = ((await (await GET(adminHealthEvent())).json()) as { sessions: { active_count: number } })
			.sessions.active_count;
		expect(after).toBe(baseline + 2);
	});
});

describe.skipIf(!hasDbEnv)('#425 — admin overview counts batch_items, not upload_sessions', () => {
	it('pendingExtractions rises by exactly the queued/extracting items just created', async () => {
		const { load } = await import('../src/routes/(admin)/admin/+page.server');

		const baseline = ((await load({} as never)) as { pendingExtractions: number }).pendingExtractions;

		const { itemIds: [a] } = await store.createBatch(rid, [{ key: 'ns/d.pdf', name: 'd.pdf' }]);
		await store.markQueued(a);

		const after = ((await load({} as never)) as { pendingExtractions: number }).pendingExtractions;
		expect(after).toBe(baseline + 1);
	});

	it('done/confirmed/discarded items are not counted as pending', async () => {
		const { load } = await import('../src/routes/(admin)/admin/+page.server');

		const baseline = ((await load({} as never)) as { pendingExtractions: number }).pendingExtractions;

		const { itemIds: [a, b] } = await store.createBatch(rid, [
			{ key: 'ns/e.pdf', name: 'e.pdf' },
			{ key: 'ns/f.pdf', name: 'f.pdf' },
		]);
		await store.markQueued(a);
		await store.markExtracting(a);
		await store.markDone(a, { supplier_name: 'Test' }, []);
		await store.markConfirmed(a);
		await store.markQueued(b);
		await store.markDiscarded(b);

		const after = ((await load({} as never)) as { pendingExtractions: number }).pendingExtractions;
		expect(after).toBe(baseline);
	});
});
