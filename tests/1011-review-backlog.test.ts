/**
 * Issue #1011 — `done` is the only non-terminal batch-item status with no
 * timeout, no reaper, no reminder and no metric: once extraction finishes, an
 * item waits for a human forever and nothing watches that wait.
 * `system-health.ts`'s "Last extraction" reads `max(updated_at)`, which goes
 * *up* when new work arrives, so it reports healthy while a review queue rots.
 *
 * By the time an item is `done` the monthly slot is claimed and the Gemini
 * call is paid for, so an abandoned one is full cost and zero value. This adds
 * the one number the issue asks for first: the age of the oldest unreviewed
 * item, plus how many items and tenants are past the staleness budget.
 *
 * Deliberately not included: an auto-expire of `done` items (silently
 * discarding a document the user paid to extract is worse than the current
 * behaviour), and any change to `pipeline-stats`' `succeeded` count — moving
 * `done` out of it would shift the existing extraction-success alert
 * thresholds as a side effect.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { reviewBacklogCheck } from '../src/lib/server/system-health';
import { reviewBacklog } from '../src/lib/server/pipeline-stats';
import type { ReviewBacklog } from '../src/lib/server/pipeline-stats';
import { testSql, closeDb, hasDbEnv, createTestRestaurant, cleanupTestRestaurant } from './helpers/test-db';

afterAll(() => closeDb());

function backlog(over: Partial<ReviewBacklog> = {}): ReviewBacklog {
	return {
		items: 0, tenants: 0, oldestAt: null, oldestAgeHours: null,
		staleAfterHours: 168, staleItems: 0, staleTenants: 0, ...over,
	};
}

describe('reviewBacklogCheck', () => {
	it('is ok with an empty queue', () => {
		const check = reviewBacklogCheck(backlog());
		expect(check.status).toBe('ok');
		expect(check.detail).toMatch(/No extracted documents/);
	});

	it('is ok while the oldest item is fresh', () => {
		expect(reviewBacklogCheck(backlog({ items: 4, tenants: 2, oldestAgeHours: 5 })).status).toBe('ok');
	});

	it('warns past three days and errors past a week', () => {
		expect(reviewBacklogCheck(backlog({ items: 4, tenants: 1, oldestAgeHours: 80 })).status).toBe('warn');
		expect(reviewBacklogCheck(backlog({ items: 4, tenants: 1, oldestAgeHours: 200 })).status).toBe('error');
	});

	it('names the oldest age and the stale tenants, so the row is actionable', () => {
		const check = reviewBacklogCheck(backlog({
			items: 40, tenants: 3, oldestAgeHours: 200, staleItems: 12, staleTenants: 1,
		}));
		expect(check.detail).toContain('40 awaiting review across 3 tenant(s)');
		expect(check.detail).toContain('12 older than 168h in 1 tenant(s)');
	});
});

describe.skipIf(!hasDbEnv)('reviewBacklog', () => {
	it('counts only items still waiting for review, and ages them from extraction', async () => {
		const restaurant = await createTestRestaurant('review-backlog');
		try {
			const [batch] = await testSql`
				INSERT INTO upload_batches (restaurant_id) VALUES (${restaurant.id}) RETURNING id
			`;
			if (!batch) throw new Error('upload_batches insert returned no row');
			const insert = (position: number, status: string, hoursAgo: number) => {
				const fileKey = `review-backlog-${position}.pdf`;
				const age = `${hoursAgo} hours`;
				return testSql`
					INSERT INTO batch_items (batch_id, restaurant_id, position, file_key, display_name, status, extracted_at, updated_at)
					VALUES (
						${batch.id}, ${restaurant.id}, ${position},
						${fileKey}, ${fileKey}, ${status},
						now() - ${age}::interval, now() - ${age}::interval
					)
				`;
			};
			await insert(1, 'done', 240);
			await insert(2, 'done', 2);
			await insert(3, 'confirmed', 500);
			await insert(4, 'failed', 500);

			const before = await reviewBacklog();
			const mine = await testSql`
				SELECT count(*)::int AS n FROM batch_items
				WHERE restaurant_id = ${restaurant.id} AND status = 'done'
			`;
			expect(mine[0]!.n).toBe(2);
			expect(before.items).toBeGreaterThanOrEqual(2);
			expect(before.oldestAgeHours ?? 0).toBeGreaterThanOrEqual(239);
			expect(before.staleItems).toBeGreaterThanOrEqual(1);
			expect(before.staleTenants).toBeGreaterThanOrEqual(1);

			const shortWindow = await reviewBacklog(1);
			expect(shortWindow.staleItems).toBeGreaterThanOrEqual(2);
		} finally {
			await cleanupTestRestaurant(restaurant.id);
		}
	});
});
