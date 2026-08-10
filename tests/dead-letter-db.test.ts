/**
 * DB-backed tests for the dead letter queue store (audit table + retention).
 *
 * The behaviour that matters here is the one a unit test cannot prove: a job
 * that keeps failing collapses into a single auditable row (occurrences goes
 * up, the row count does not), resolving an entry lets the next failure open a
 * fresh one, and the retention purge only reaps what it should.
 *
 * `$lib/server/db` is redirected at the shared test connection, so the module
 * under test runs its real queries. Skipped when the DB gate is closed.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, getDb: () => testDb, forTenant };
});

const {
	countDeadLetters,
	deadLetterQueueBreakdown,
	getDeadLetter,
	listDeadLetters,
	pendingDeadLetterCount,
	purgeDeadLetters,
	recordDeadLetter,
	setDeadLetterStatus,
	DEAD_LETTER_RESOLVED_RETENTION_DAYS,
	DEAD_LETTER_PENDING_RETENTION_DAYS,
} = await import('../src/lib/server/dead-letter');

const QUEUE = 'test-extract-invoice';
const OTHER_QUEUE = 'test-normalize-product';

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('dlq');
	rid = r.id;
});

beforeEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM dead_letter_queue WHERE queue IN (${QUEUE}, ${OTHER_QUEUE})`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM dead_letter_queue WHERE queue IN (${QUEUE}, ${OTHER_QUEUE})`;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('recordDeadLetter', () => {
	it('parks a corrupt record with its classification, payload and tenant', async () => {
		const id = await recordDeadLetter({
			queue: QUEUE,
			error: new Error('LLM returned invalid JSON (120 chars)'),
			restaurantId: rid,
			sourceId: 'item-1',
			jobId: 'job-1',
			payload: { itemId: 'item-1', restaurantId: rid, apiKey: 'secret-value' },
		});

		expect(id).not.toBeNull();
		const entry = await getDeadLetter(id!);
		expect(entry).toMatchObject({
			queue: QUEUE,
			restaurantId: rid,
			sourceId: 'item-1',
			jobId: 'job-1',
			errorClass: 'corrupt.invalidJson',
			status: 'pending',
			occurrences: 1,
		});
		expect(entry!.errorMessage).toContain('invalid JSON');
		expect(entry!.stack).toBeTruthy();
		expect(entry!.payload).toEqual({ itemId: 'item-1', restaurantId: rid, apiKey: '[redacted]' });
	});

	it('collapses repeated failures of the same record into one auditable row', async () => {
		for (let i = 0; i < 3; i++) {
			await recordDeadLetter({
				queue: QUEUE,
				error: new Error('LLM returned invalid JSON (120 chars)'),
				restaurantId: rid,
				sourceId: 'item-2',
				attempt: i + 1,
			});
		}

		const rows = await listDeadLetters({ queue: QUEUE });
		expect(rows).toHaveLength(1);
		expect(rows[0].occurrences).toBe(3);
		expect(rows[0].attempt).toBe(3);
		expect(rows[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(rows[0].firstSeenAt.getTime());
	});

	it('keeps a different failure mode of the same record separate', async () => {
		await recordDeadLetter({ queue: QUEUE, error: new Error('LLM returned invalid JSON'), sourceId: 'item-3' });
		await recordDeadLetter({ queue: QUEUE, error: new Error('ENOENT: no such file'), sourceId: 'item-3' });

		const rows = await listDeadLetters({ queue: QUEUE });
		expect(rows.map(r => r.errorClass).sort()).toEqual(['corrupt.invalidJson', 'corrupt.missingFile']);
	});

	it('opens a fresh entry once the previous one has been audited', async () => {
		const first = await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'item-4' });
		await setDeadLetterStatus(first!, 'reviewed', 'admin@example.com');

		const second = await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'item-4' });
		expect(second).not.toBe(first);

		const rows = await listDeadLetters({ queue: QUEUE });
		expect(rows).toHaveLength(2);
		expect(rows.filter(r => r.status === 'pending')).toHaveLength(1);
	});
});

describe.skipIf(!hasDbEnv)('listing and counting', () => {
	beforeEach(async () => {
		await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'a', restaurantId: rid });
		await recordDeadLetter({ queue: OTHER_QUEUE, error: new Error('boom'), sourceId: 'b' });
		const resolved = await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'c' });
		await setDeadLetterStatus(resolved!, 'discarded', 'admin@example.com');
	});

	it('joins the tenant name so the audit view names the restaurant', async () => {
		const [row] = await listDeadLetters({ queue: QUEUE, status: 'pending' });
		expect(row.restaurantName).toContain('Test Restaurant dlq');
	});

	it('filters by queue and by status', async () => {
		expect(await countDeadLetters({ queue: QUEUE })).toBe(2);
		expect(await countDeadLetters({ queue: QUEUE, status: 'pending' })).toBe(1);
		expect(await countDeadLetters({ queue: OTHER_QUEUE })).toBe(1);
	});

	it('filters by tenant', async () => {
		const rows = await listDeadLetters({ restaurantId: rid });
		expect(rows).toHaveLength(1);
		expect(rows[0].sourceId).toBe('a');
	});

	it('reports pending vs total per queue for the admin dashboard', async () => {
		const breakdown = await deadLetterQueueBreakdown();
		const mine = breakdown.find(b => b.queue === QUEUE);
		expect(mine).toEqual({ queue: QUEUE, pending: 1, total: 2 });
	});

	it('counts everything still awaiting an audit', async () => {
		expect(await pendingDeadLetterCount()).toBeGreaterThanOrEqual(2);
	});

	it('paginates newest-first', async () => {
		const page = await listDeadLetters({ queue: QUEUE }, 1, 0);
		expect(page).toHaveLength(1);
	});
});

describe.skipIf(!hasDbEnv)('setDeadLetterStatus', () => {
	it('stamps who audited the entry and when', async () => {
		const id = await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'r1' });
		expect(await setDeadLetterStatus(id!, 'reviewed', 'admin@example.com')).toBe(true);

		const entry = await getDeadLetter(id!);
		expect(entry!.status).toBe('reviewed');
		expect(entry!.reviewedBy).toBe('admin@example.com');
		expect(entry!.reviewedAt).toBeInstanceOf(Date);
	});

	it('reports a miss for an unknown or invalid id', async () => {
		expect(await setDeadLetterStatus(2147483600, 'reviewed', null)).toBe(false);
		expect(await setDeadLetterStatus(-1, 'reviewed', null)).toBe(false);
		expect(await getDeadLetter(0)).toBeNull();
	});
});

describe.skipIf(!hasDbEnv)('purgeDeadLetters', () => {
	const ageTo = (id: number, days: number) => testSql`
		UPDATE dead_letter_queue SET last_seen_at = now() - ${days} * interval '1 day' WHERE id = ${id}`;

	it('reaps audited entries past retention but keeps recent and pending ones', async () => {
		const stale = await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'stale' });
		const recent = await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'recent' });
		const pending = await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'pending' });
		await setDeadLetterStatus(stale!, 'reviewed', null);
		await setDeadLetterStatus(recent!, 'reviewed', null);

		await ageTo(stale!, DEAD_LETTER_RESOLVED_RETENTION_DAYS + 1);
		await ageTo(recent!, DEAD_LETTER_RESOLVED_RETENTION_DAYS - 1);
		await ageTo(pending!, DEAD_LETTER_RESOLVED_RETENTION_DAYS - 1);

		// purgeDeadLetters() sweeps the whole table, so assert on the rows this
		// test owns rather than the total — a stale row left by another suite (or
		// by a developer's own database) must not decide whether this passes.
		await purgeDeadLetters();
		expect(await getDeadLetter(stale!)).toBeNull();
		expect(await getDeadLetter(recent!)).not.toBeNull();
		expect(await getDeadLetter(pending!)).not.toBeNull();
	});

	it('eventually reaps a pending entry nobody ever audited', async () => {
		const forgotten = await recordDeadLetter({ queue: QUEUE, error: new Error('boom'), sourceId: 'forgotten' });
		await ageTo(forgotten!, DEAD_LETTER_PENDING_RETENTION_DAYS + 1);

		expect((await purgeDeadLetters()).purged).toBeGreaterThanOrEqual(1);
		expect(await getDeadLetter(forgotten!)).toBeNull();
	});
});
