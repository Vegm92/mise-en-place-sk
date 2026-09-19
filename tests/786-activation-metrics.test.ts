import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import { testSql, closeDb, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';

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

const { timeToValueStats, weekFourRetention } = await import('../src/lib/server/activation-metrics');

const DAY_MS = 24 * 60 * 60 * 1000;
let restaurantIds: string[] = [];

async function makeRestaurant(createdAt: Date): Promise<string> {
	const slug = `test-vitest-786-${restaurantIds.length}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const [row] = await testSql`
		INSERT INTO restaurants (name, slug, created_at)
		VALUES (${'Test 786 ' + slug}, ${slug}, ${createdAt.toISOString()})
		RETURNING id
	`;
	const id = row!.id as string;
	restaurantIds.push(id);
	return id;
}

async function makeInvoice(restaurantId: string, createdAt: Date, reviewState = 'revisado') {
	await testSql`
		INSERT INTO invoices (restaurant_id, created_at, review_state)
		VALUES (${restaurantId}, ${createdAt.toISOString()}, ${reviewState})
	`;
}

afterEach(async () => {
	if (!hasDbEnv) return;
	const ids = restaurantIds;
	restaurantIds = [];
	for (const id of ids) await cleanupTestRestaurant(id);
});

afterAll(async () => {
	await closeDb();
});

describe.skipIf(!hasDbEnv)('timeToValueStats (issue #786)', () => {
	it('reports no sample for a restaurant that has never reviewed an albarán', async () => {
		const rid = await makeRestaurant(new Date('2024-01-01T00:00:00Z'));
		const stats = await timeToValueStats([rid]);
		expect(stats).toEqual({ sampleSize: 0, medianMinutes: null, p90Minutes: null });
	});

	it('measures the gap from a restaurant to its own first reviewed albarán, not a later one', async () => {
		const signup = new Date('2024-01-01T00:00:00Z');
		const rid = await makeRestaurant(signup);
		await makeInvoice(rid, new Date(signup.getTime() + 5 * 60 * 1000));
		await makeInvoice(rid, new Date(signup.getTime() + 90 * 60 * 1000));

		const stats = await timeToValueStats([rid]);
		expect(stats.sampleSize).toBe(1);
		expect(stats.medianMinutes).toBeCloseTo(5, 5);
		expect(stats.p90Minutes).toBeCloseTo(5, 5);
	});

	it('ignores an invoice still awaiting review', async () => {
		const signup = new Date('2024-01-01T00:00:00Z');
		const rid = await makeRestaurant(signup);
		await makeInvoice(rid, new Date(signup.getTime() + 5 * 60 * 1000), 'por_revisar');

		const stats = await timeToValueStats([rid]);
		expect(stats).toEqual({ sampleSize: 0, medianMinutes: null, p90Minutes: null });
	});

	it('computes the interpolated median/p90 across several restaurants', async () => {
		const signup = new Date('2024-01-01T00:00:00Z');
		const ids: string[] = [];
		for (const minutes of [1, 2, 3]) {
			const rid = await makeRestaurant(signup);
			await makeInvoice(rid, new Date(signup.getTime() + minutes * 60 * 1000));
			ids.push(rid);
		}

		const stats = await timeToValueStats(ids);
		expect(stats.sampleSize).toBe(3);
		expect(stats.medianMinutes).toBeCloseTo(2, 5);
		expect(stats.p90Minutes).toBeCloseTo(2.8, 5);
	});
});

describe.skipIf(!hasDbEnv)('weekFourRetention (issue #786)', () => {
	it('reports an empty cohort for a restaurant that never confirmed anything', async () => {
		const now = new Date('2024-03-01T00:00:00Z');
		const rid = await makeRestaurant(new Date(now.getTime() - 40 * DAY_MS));
		const retention = await weekFourRetention(now, [rid]);
		expect(retention).toEqual({ cohortSize: 0, retainedCount: 0, retentionRate: null });
	});

	it('splits the week-1 cohort by week-4 activity, measured from each restaurant’s own signup', async () => {
		const now = new Date('2024-03-01T00:00:00Z');
		const ageStart = new Date(now.getTime() - 40 * DAY_MS);
		const day = (n: number) => new Date(ageStart.getTime() + n * DAY_MS);
		const ids: string[] = [];

		// A: eligible, active week 1, active exactly at the week-4 lower bound -> retained
		const a = await makeRestaurant(ageStart);
		await makeInvoice(a, day(3));
		await makeInvoice(a, day(21));
		ids.push(a);

		// B: eligible, active week 1, never active week 4 -> in cohort, not retained
		const b = await makeRestaurant(ageStart);
		await makeInvoice(b, day(2));
		ids.push(b);

		// C: eligible, active week 4 only -> never entered the cohort
		const c = await makeRestaurant(ageStart);
		await makeInvoice(c, day(25));
		ids.push(c);

		// D: too young for the week-4 window to have closed yet -> excluded outright
		const d = await makeRestaurant(new Date(now.getTime() - 10 * DAY_MS));
		await makeInvoice(d, new Date(now.getTime() - 8 * DAY_MS));
		ids.push(d);

		// E: week-1 invoice still awaiting review -> does not count as confirmed
		const e = await makeRestaurant(ageStart);
		await makeInvoice(e, day(3), 'por_revisar');
		ids.push(e);

		// F: active exactly at the week-1 upper bound (day 7), which is excluded
		const f = await makeRestaurant(ageStart);
		await makeInvoice(f, day(7));
		ids.push(f);

		const retention = await weekFourRetention(now, ids);
		expect(retention).toEqual({ cohortSize: 2, retainedCount: 1, retentionRate: 0.5 });
	});
});
