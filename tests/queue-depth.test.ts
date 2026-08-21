/**
 * Regression tests for issue #425 — /api/health's queue-depth probe and the
 * admin dashboard's "in flight" tile both read `upload_sessions`, a table
 * nothing has written to since the pipeline moved to `upload_batches` /
 * `batch_items` (ADR-015). Both always reported zero as a result.
 *
 * These prove the counts now come from real `batch_items` rows in the
 * 'queued'/'extracting' states, and are computed against a captured baseline
 * rather than an absolute number so a shared test database with residue from
 * other suites cannot make this pass by accident.
 *
 * `$lib/server/db` is redirected at the shared test connection, like the
 * other DB-backed suites. Skipped when the DB gate is closed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { createBatchStore } from '../src/lib/server/batch';

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, getDb: () => testDb, forTenant };
});

let rid = '';
const store = hasDbEnv ? createBatchStore(testDb) : null!;

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('queue-depth')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM upload_sessions WHERE id = ${'legacy-session-425'}`;
	await cleanupTestRestaurant(rid); // batches/items cascade
	await closeDb();
});

describe.skipIf(!hasDbEnv)('#425 — /api/health counts batch_items, not upload_sessions', () => {
	it('active_count rises by exactly the queued/extracting items just created', async () => {
		const { GET } = await import('../src/routes/api/health/+server');

		const baseline = ((await (await GET()).json()) as { sessions: { active_count: number } })
			.sessions.active_count;

		const { itemIds: [a, b, c] } = await store.createBatch(rid, [
			{ key: 'ns/a.pdf', name: 'a.pdf' },
			{ key: 'ns/b.pdf', name: 'b.pdf' },
			{ key: 'ns/c.pdf', name: 'c.pdf' },
		]);
		await store.markQueued(a);
		await store.markQueued(b);
		await store.markExtracting(b);
		void c; // left pending — must not count

		const after = ((await (await GET()).json()) as { sessions: { active_count: number } })
			.sessions.active_count;
		expect(after).toBe(baseline + 2);
	});

	it('a stale upload_sessions row does not move the count (the old bug)', async () => {
		const { GET } = await import('../src/routes/api/health/+server');
		const baseline = ((await (await GET()).json()) as { sessions: { active_count: number } })
			.sessions.active_count;

		// Under the old query this row alone would have made active_count ≥ 1
		// regardless of real queue state — the bug this issue fixes.
		await testSql`
			INSERT INTO upload_sessions (id, data)
			VALUES (${'legacy-session-425'}, ${JSON.stringify({ extractionStatus: 'queued' })})
		`;

		const after = ((await (await GET()).json()) as { sessions: { active_count: number } })
			.sessions.active_count;
		expect(after).toBe(baseline);
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
