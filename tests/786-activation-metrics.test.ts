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

const {
	timeToValueStats, weekFourRetention, activationFunnel, activationReport, summarizeFunnel, isInternalTenant,
	FUNNEL_STEPS, INSIGHT_BUCKETS,
} = await import('../src/lib/server/activation-metrics');
const { default: es } = await import('../src/lib/messages/es');
const { default: en } = await import('../src/lib/messages/en');

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
let restaurantIds: string[] = [];
let userIds: string[] = [];

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
	for (const id of [...ids].reverse()) await cleanupTestRestaurant(id);
	const users = userIds;
	userIds = [];
	for (const id of users) await testSql`DELETE FROM users WHERE id = ${id}`;
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

type Input = Parameters<typeof summarizeFunnel>[0][number];

function input(id: string, signupAt: Date, offsets: { upload?: number; extracted?: number; insight?: number } = {}, extra: Partial<Input> = {}): Input {
	const at = (min?: number) => (min === undefined ? null : new Date(signupAt.getTime() + min * MIN_MS));
	return {
		id, name: id, signupAt, cohortWeek: '2024-01-15',
		firstUploadAt: at(offsets.upload), firstExtractedAt: at(offsets.extracted), firstInsightAt: at(offsets.insight),
		activeWeekFour: false, ...extra,
	};
}

describe('summarizeFunnel', () => {
	const now = new Date('2024-03-01T00:00:00Z');
	const old = new Date(now.getTime() - 40 * DAY_MS);

	it('renders an all-empty funnel with no customers', () => {
		const f = summarizeFunnel([], now);
		expect(f.steps.map((s) => [s.key, s.count, s.rate, s.share])).toEqual(FUNNEL_STEPS.map((k) => [k, 0, null, 0]));
		expect(f.timeToInsight).toMatchObject({ sampleSize: 0, medianMinutes: null, p75Minutes: null, uploaders: 0, targetBase: 0, withinTargetRate: null });
		expect(f.timeToInsight.buckets.every((b) => b.count === 0 && b.share === 0)).toBe(true);
		expect(f.activation).toEqual({ eligible: 0, count: 0, rate: null });
		expect(f.weekFour).toEqual({ eligible: 0, count: 0, rate: null });
		expect(f.cohorts).toEqual([]);
	});

	it('counts each step strictly, measures upload-to-insight, and only rates closed windows', () => {
		const f = summarizeFunnel([
			input('a', old, { upload: 5, extracted: 6, insight: 9 }, { activeWeekFour: true }),
			input('b', old, { upload: 60, extracted: 61, insight: 180 }),
			input('c', old, { upload: 5, extracted: 6 }),
			input('d', old, { upload: 5 }),
			input('e', old),
			input('f', new Date(now.getTime() - 2 * DAY_MS), { upload: 10, extracted: 11, insight: 40 }, { cohortWeek: '2024-02-26' }),
			input('g', old, { insight: DAY_MS / MIN_MS }),
		], now, 3);

		expect(f.excludedInternal).toBe(3);
		expect(f.steps.map((s) => [s.key, s.count, s.base])).toEqual([
			['signup', 7, 7], ['upload', 5, 7], ['extracted', 4, 5], ['insight', 3, 4], ['week4', 1, 2],
		]);
		expect(f.steps[4]?.rate).toBe(0.5);

		const tti = f.timeToInsight;
		expect([tti.sampleSize, tti.medianMinutes, tti.p75Minutes]).toEqual([3, 30, 75]);
		expect([tti.uploaders, tti.targetBase, tti.withinTarget, tti.withinTargetRate]).toEqual([5, 5, 1, 0.2]);
		expect(Object.fromEntries(tti.buckets.map((b) => [b.key, b.count]))).toEqual({ le10m: 1, le1h: 1, le1d: 1, le7d: 0, gt7d: 0, none: 2 });

		expect(f.activation).toEqual({ eligible: 6, count: 3, rate: 0.5 });
		expect(f.weekFour).toEqual({ eligible: 6, count: 1, rate: 1 / 6 });
		expect(f.cohorts).toEqual([
			{ week: '2024-02-26', signups: 1, activated: 1, weekFour: { eligible: 0, count: 0, rate: null } },
			{ week: '2024-01-15', signups: 6, activated: 3, weekFour: { eligible: 6, count: 1, rate: 1 / 6 } },
		]);
		expect(f.restaurants.find((r) => r.id === 'f')?.weekFour).toBe('pending');
		expect(f.restaurants.find((r) => r.id === 'e')?.weekFour).toBe('inactive');
	});

	it('holds the 10-minute target, 7-day activation and 28-day window boundaries', () => {
		const at = (min: number) => new Date(now.getTime() - min * MIN_MS);
		const f = summarizeFunnel([
			input('exact', at(60), { upload: 0, insight: 10 }),
			input('fresh', at(9), { upload: 0, insight: 1 }),
			input('day7', new Date(now.getTime() - 7 * DAY_MS), { upload: 0, insight: 7 * 24 * 60 }),
			input('late', new Date(now.getTime() - 8 * DAY_MS), { upload: 0, insight: 7 * 24 * 60 + 1 }),
			input('day28', new Date(now.getTime() - 28 * DAY_MS)),
		], now);
		expect([f.timeToInsight.targetBase, f.timeToInsight.withinTarget]).toEqual([3, 1]);
		expect(f.activation).toEqual({ eligible: 3, count: 1, rate: 1 / 3 });
		expect(f.restaurants.find((r) => r.id === 'day28')?.weekFour).toBe('inactive');
		expect(f.weekFour.eligible).toBe(1);
	});
});

describe('isInternalTenant', () => {
	it('flags admin members and reserved test domains, not lookalikes', () => {
		const isAdmin = (email: string) => email === 'ops@mep-hq.es';
		for (const email of ['ops@mep-hq.es', 'demo@example.com', 'qa@sub.example.org', 'admin@mep.test', 'x@foo.example', 'x@localhost']) {
			expect(isInternalTenant(['chef@bar.es', email], isAdmin)).toBe(true);
		}
		for (const email of ['chef@bar.es', 'owner@contest.com', 'x@latest.io', 'x@example.es']) {
			expect(isInternalTenant([email], isAdmin)).toBe(false);
		}
		expect(isInternalTenant([], isAdmin)).toBe(false);
	});
});

describe('activation funnel labels', () => {
	it('resolves every step and bucket key in both locales', () => {
		const keys = [
			...FUNNEL_STEPS.map((k) => `admin.activation.funnel.${k}`),
			...[...INSIGHT_BUCKETS.map((b) => b.key), 'none'].map((k) => `admin.activation.tti.bucket.${k}`),
		];
		const missing = keys.filter((k) => !(k in es) || !(k in en));
		expect(missing).toEqual([]);
	});
});

async function addMember(restaurantId: string, email: string) {
	const [user] = await testSql`INSERT INTO users (email) VALUES (${email}) RETURNING id`;
	userIds.push(user!.id as string);
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id) VALUES (${user!.id as string}, ${restaurantId})`;
}

async function addBatchItem(restaurantId: string, createdAt: Date, extractedAt: Date | null = null, extracted = true) {
	const [batch] = await testSql`
		INSERT INTO upload_batches (restaurant_id, created_at) VALUES (${restaurantId}, ${createdAt.toISOString()}) RETURNING id
	`;
	await testSql`
		INSERT INTO batch_items (batch_id, restaurant_id, position, file_key, display_name, status, extracted_data, extracted_at, created_at)
		VALUES (${batch!.id as string}, ${restaurantId}, 0, 'k', 'f.pdf', ${extracted ? 'done' : 'failed'},
			CASE WHEN ${extracted}::boolean THEN '{}'::jsonb END, ${extractedAt?.toISOString() ?? null}, ${createdAt.toISOString()})
	`;
}

async function addClaim(restaurantId: string, createdAt: Date) {
	await testSql`
		INSERT INTO usage_events (restaurant_id, month, kind, delta, reason, created_at)
		VALUES (${restaurantId}, ${createdAt.toISOString().slice(0, 7)}, 'claim', 1, 'extraction', ${createdAt.toISOString()})
	`;
}

async function addCorpus(restaurantId: string, createdAt: Date, runKind = 'live') {
	await testSql`
		INSERT INTO extraction_results (restaurant_id, file_key, prompt_version, extracted_data, run_kind, created_at)
		VALUES (${restaurantId}, 'k', 'v1', '{}'::jsonb, ${runKind}, ${createdAt.toISOString()})
	`;
}

async function addNotification(restaurantId: string, type: string, createdAt: Date) {
	await testSql`
		INSERT INTO system_notifications (restaurant_id, notification_type, message, created_at)
		VALUES (${restaurantId}, ${type}, 'm', ${createdAt.toISOString()})
	`;
}

describe.skipIf(!hasDbEnv)('activationFunnel (derived from existing rows)', () => {
	const now = new Date('2024-03-01T00:00:00Z');
	const signup = new Date(now.getTime() - 40 * DAY_MS);
	const plus = (min: number) => new Date(signup.getTime() + min * MIN_MS);
	const day = (n: number) => new Date(signup.getTime() + n * DAY_MS);

	it('returns an empty funnel when there are no customers', async () => {
		const f = await activationFunnel(now, []);
		expect(f.steps.every((s) => s.count === 0)).toBe(true);
		expect(f.restaurants).toEqual([]);
	});

	it('builds the whole-platform report the admin page loads', async () => {
		const report = await activationReport(now);
		expect(report.funnel.steps.map((s) => s.key)).toEqual([...FUNNEL_STEPS]);
		expect(report.funnel.restaurants.length).toBeLessThanOrEqual(50);
		expect(report.timeToValue.sampleSize).toBeGreaterThanOrEqual(0);
	});

	it('reads milestones from the ledgers that survive the 24 h batch sweep', async () => {
		const rid = await makeRestaurant(signup);
		await addClaim(rid, plus(5));
		await addCorpus(rid, plus(1), 'replay');
		await addCorpus(rid, plus(6));
		await addNotification(rid, 'supplier_uncategorized', plus(2));
		await addNotification(rid, 'price_shock', plus(12));

		const [r] = (await activationFunnel(now, [rid])).restaurants;
		expect(r).toMatchObject({ minutesToUpload: 5, minutesToExtracted: 1, minutesToInsight: 7, activated: true });
	});

	it('prefers a live batch item over a later claim, and ignores failed extractions', async () => {
		const rid = await makeRestaurant(signup);
		await addBatchItem(rid, plus(3), plus(4), false);
		await addClaim(rid, plus(4));
		await addBatchItem(rid, plus(8), plus(9));
		await addNotification(rid, 'possible_duplicate_purchase', plus(13));

		const [r] = (await activationFunnel(now, [rid])).restaurants;
		expect(r).toMatchObject({ minutesToUpload: 3, minutesToExtracted: 6, minutesToInsight: 10 });
	});

	it('counts uploads and reviewed albaranes on days 22–28 as week-4 activity', async () => {
		const cases: Array<[string, (rid: string) => Promise<unknown>]> = [
			['active', (rid) => addClaim(rid, day(21))],
			['active', (rid) => makeInvoice(rid, new Date(day(28).getTime() - MIN_MS))],
			['active', (rid) => addBatchItem(rid, day(25))],
			['inactive', (rid) => makeInvoice(rid, day(22), 'por_revisar')],
			['inactive', (rid) => addClaim(rid, day(28))],
			['inactive', (rid) => addBatchItem(rid, new Date(day(21).getTime() - MIN_MS))],
		];
		const ids: string[] = [];
		for (const [, seed] of cases) {
			const rid = await makeRestaurant(signup);
			await seed(rid);
			ids.push(rid);
		}
		const f = await activationFunnel(now, ids);
		expect(ids.map((id) => f.restaurants.find((r) => r.id === id)?.weekFour)).toEqual(cases.map(([status]) => status));
	});

	it('excludes internal tenants and secondary locations, and buckets cohorts in Madrid time', async () => {
		const customer = await makeRestaurant(new Date('2024-01-14T23:30:00Z'));
		await addMember(customer, `chef-${customer}@bar-pepe.es`);
		const demo = await makeRestaurant(signup);
		await addMember(demo, `demo-${demo}@example.com`);
		const slug = `test-vitest-786-child-${customer}`;
		const [child] = await testSql`
			INSERT INTO restaurants (name, slug, parent_id, created_at)
			VALUES (${slug}, ${slug}, ${customer}, ${signup.toISOString()}) RETURNING id
		`;
		restaurantIds.push(child!.id as string);

		const f = await activationFunnel(now, [customer, demo, child!.id as string]);
		expect(f.restaurants.map((r) => [r.id, r.cohortWeek])).toEqual([[customer, '2024-01-15']]);
		expect(f.excludedInternal).toBe(1);
	});
});
