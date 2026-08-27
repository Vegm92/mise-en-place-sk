/**
 * Scheduled jobs (issues #288 / #289 / #518).
 *
 * These emails only matter for tenants who stopped opening the app, so the
 * behaviour under test is: the cron dispatcher picks the right tenants and
 * queues one job each, and the per-tenant handler sends its notice exactly
 * once (the claim is what makes a retried job safe). The file purge both
 * deletes the object and stops the row pointing at it.
 *
 * db, storage, and Resend are mocked; the drizzle query builders are
 * replayed against per-table fixtures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';

const { state, sendEmailMock, storageDeleteMock, executeMock } = vi.hoisted(() => ({
	state: {
		// rows returned for a select from each table, by table name. A function
		// value is invoked per call instead of returned directly.
		rows: {} as Record<string, unknown[] | (() => unknown[])>,
		// claimOnce results, in call order (true = first time this value is stored)
		claims: [] as boolean[],
		claimCalls: [] as Array<{ key: string; value: string }>,
		flags: [] as Array<{ key: string; value: string }>,
		updates: [] as Array<Record<string, unknown>>,
		subscriptionInserts: [] as Array<Record<string, unknown>>,
	},
	sendEmailMock: vi.fn().mockResolvedValue(undefined),
	storageDeleteMock: vi.fn().mockResolvedValue(undefined),
	executeMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('$lib/server/db', () => {
	const chain = (rowsFor: () => unknown[]) => {
		const p: Record<string, unknown> = {};
		const self = () => p;
		for (const m of ['from', 'leftJoin', 'where', 'limit', 'orderBy']) p[m] = self;
		// `from` decides which fixture this query resolves to. A function value
		// (instead of a plain array) is invoked per call, so a test can queue
		// per-call results/throws — used to simulate one tenant's lookup failing.
		p.from = (table: never) => {
			const name = getTableName(table);
			const resolved = () => {
				const val = state.rows[name];
				return typeof val === 'function' ? (val as () => unknown[])() : (val ?? []);
			};
			return chainResolving(resolved);
		};
		p.then = (res: (v: unknown) => unknown) => Promise.resolve(rowsFor()).then(res);
		return p;
	};
	const chainResolving = (rowsFor: () => unknown[]): Record<string, unknown> => {
		const p: Record<string, unknown> = {};
		for (const m of ['leftJoin', 'where', 'limit', 'orderBy']) p[m] = () => p;
		p.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
			Promise.resolve().then(rowsFor).then(res, rej);
		return p;
	};

	const claimReturning = (values: { key: string; value: string }) => {
		state.claimCalls.push({ key: values.key, value: values.value });
		const granted = state.claims.shift() ?? true;
		return Promise.resolve(granted ? [{ value: values.value }] : []);
	};
	const insertValues = (table: string, values: Record<string, unknown>) => ({
		onConflictDoUpdate: () => {
			if (table === 'app_flags') {
				state.flags.push(values as { key: string; value: string });
				return Promise.resolve([]);
			}
			if (table === 'subscriptions') {
				state.subscriptionInserts.push(values);
				return Promise.resolve([]);
			}
			return { returning: () => claimReturning(values as { key: string; value: string }) };
		},
	});

	const db = {
		select: () => chain(() => []),
		execute: executeMock,
		insert: (table: never) => ({
			values: (values: Record<string, unknown>) => insertValues(getTableName(table), values),
		}),
		update: () => ({
			set: (values: Record<string, unknown>) => ({
				where: () => {
					state.updates.push(values);
					return Promise.resolve([]);
				},
			}),
		}),
	};
	return { db, forTenant: (rid: string) => ({ rid, scope: () => ({}) }) };
});

vi.mock('$lib/server/storage', () => ({ getStorage: () => ({ delete: storageDeleteMock }) }));
vi.mock('$lib/server/email', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/email')>();
	return { ...actual, sendEmail: sendEmailMock };
});
vi.mock('$lib/server/weekly-digest', () => ({
	isoWeek: () => '2026-W30',
	getOrGenerateWeeklyDigest: vi.fn().mockResolvedValue('Gasto estable.\n\nRecommended: nada.'),
}));

import {
	trialDaysLeft,
	trialMilestoneFor,
	runTrialNoticesJob,
	sendTrialNotice,
	runOverdueRemindersJob,
	sendOverdueReminder,
	runWeeklyDigestJob,
	sendWeeklyDigest,
	runFilePurgeJob,
	runAnalyticsRefreshJob,
	runOrphanSubscriptionsJob,
	reconcileOrphanSubscriptions,
	DIGEST_TENANT_QUEUE,
	REMINDERS_TENANT_QUEUE,
	TRIAL_TENANT_QUEUE,
	DELETED_FILE_RETENTION_DAYS,
} from '../src/lib/server/scheduler';

const DAY = 86_400_000;

interface InsertedJob {
	data: Record<string, unknown>;
	singletonKey: string;
	deadLetter: string;
}

function fakeBoss() {
	const inserts: Array<{ queue: string; jobs: InsertedJob[] }> = [];
	const boss = {
		insert: vi.fn(async (queue: string, jobs: InsertedJob[]) => {
			inserts.push({ queue, jobs });
			return jobs.map((_, i) => `job-${inserts.length}-${i}`);
		}),
	};
	return { boss: boss as unknown as PgBoss, inserts, insertMock: boss.insert };
}

function jobsFor(inserts: Array<{ queue: string; jobs: InsertedJob[] }>): InsertedJob[] {
	return inserts.flatMap(i => i.jobs);
}

function tenant(overrides: Record<string, unknown> = {}) {
	return {
		id: 'rest-1',
		name: 'Casa Lua',
		planTier: 'trial',
		status: 'trialing',
		trialEndsAt: new Date(Date.now() + 7 * DAY),
		...overrides,
	};
}

beforeEach(() => {
	state.rows = {
		restaurants: [],
		user_restaurants: [{ userId: 'user-1' }],
		users: [{ id: 'user-1', email: 'owner@example.com' }],
		invoices: [],
		settings: [],
	};
	state.claims = [];
	state.claimCalls = [];
	state.flags = [];
	state.updates = [];
	state.subscriptionInserts = [];
	sendEmailMock.mockClear();
	storageDeleteMock.mockClear().mockResolvedValue(undefined);
	executeMock.mockClear().mockResolvedValue([]);
});

describe('trialDaysLeft', () => {
	it('rounds up remaining days and goes negative after the end', () => {
		const now = new Date('2026-07-01T12:00:00Z');
		expect(trialDaysLeft(new Date('2026-07-08T12:00:00Z'), now)).toBe(7);
		expect(trialDaysLeft(new Date('2026-07-01T18:00:00Z'), now)).toBe(1);
		expect(trialDaysLeft(new Date('2026-06-30T12:00:00Z'), now)).toBe(-1);
	});
});

describe('trialMilestoneFor', () => {
	it('stays quiet more than a week out', () => {
		expect(trialMilestoneFor(30)).toBeNull();
		expect(trialMilestoneFor(8)).toBeNull();
	});

	it('bands 7…2 days into the T-7 notice', () => {
		expect(trialMilestoneFor(7)).toBe(7);
		expect(trialMilestoneFor(2)).toBe(7);
	});

	it('sends the final-day notice at 1 day left', () => {
		expect(trialMilestoneFor(1)).toBe(1);
	});

	it('sends the lapsed notice from the end date onwards', () => {
		expect(trialMilestoneFor(0)).toBe(0);
		expect(trialMilestoneFor(-5)).toBe(0);
	});
});

describe('runTrialNoticesJob', () => {
	it('queues one job per tenant at a milestone, keyed on the trial end date', async () => {
		const endsAt = new Date(Date.now() + 7 * DAY);
		state.rows.restaurants = [tenant({ trialEndsAt: endsAt })];
		const { boss, inserts } = fakeBoss();

		const result = await runTrialNoticesJob(boss);

		expect(result).toEqual({ scanned: 1, considered: 1, dispatched: 1 });
		expect(inserts[0].queue).toBe(TRIAL_TENANT_QUEUE);
		expect(jobsFor(inserts)[0]).toMatchObject({
			data: { restaurantId: 'rest-1', name: 'Casa Lua', milestone: 7, claim: `${endsAt.toISOString().slice(0, 10)}:7` },
			singletonKey: `rest-1:${endsAt.toISOString().slice(0, 10)}:7`,
		});
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('ignores tenants that are not on a trial', async () => {
		state.rows.restaurants = [tenant({ status: 'active', planTier: 'pro' })];
		const { boss, insertMock } = fakeBoss();

		expect(await runTrialNoticesJob(boss)).toEqual({ scanned: 1, considered: 0, dispatched: 0 });
		expect(insertMock).not.toHaveBeenCalled();
	});

	it('ignores trials that are still more than a week out', async () => {
		state.rows.restaurants = [tenant({ trialEndsAt: new Date(Date.now() + 30 * DAY) })];
		const { boss } = fakeBoss();

		expect(await runTrialNoticesJob(boss)).toEqual({ scanned: 1, considered: 0, dispatched: 0 });
	});

	it('records the run summary so a half-finished dispatch is visible', async () => {
		state.rows.restaurants = [tenant()];
		const { boss } = fakeBoss();

		await runTrialNoticesJob(boss);

		const flag = state.flags.find(f => f.key === 'job_run:trial-notices');
		expect(flag).toBeDefined();
		expect(JSON.parse(flag!.value)).toMatchObject({ scanned: 1, considered: 1, dispatched: 1 });
	});
});

describe('sendTrialNotice', () => {
	it('emails the owner once per milestone', async () => {
		expect(await sendTrialNotice({ restaurantId: 'rest-1', name: 'Casa Lua', milestone: 7, claim: '2026-08-01:7' })).toBe(true);

		expect(state.claimCalls[0]).toEqual({ key: 'trial_notice_sent', value: '2026-08-01:7' });
		expect(sendEmailMock).toHaveBeenCalledOnce();
		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ kind: 'trial_expiry', to: 'owner@example.com' });
	});

	it('sends nothing when the milestone was already claimed', async () => {
		state.claims = [false];

		expect(await sendTrialNotice({ restaurantId: 'rest-1', name: 'Casa Lua', milestone: 7, claim: '2026-08-01:7' })).toBe(false);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('uses the lapsed template once the trial has ended', async () => {
		await sendTrialNotice({ restaurantId: 'rest-1', name: 'Casa Lua', milestone: 0, claim: '2026-08-01:0' });

		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ kind: 'trial_expired' });
	});

	it('stays quiet when the restaurant has no reachable owner', async () => {
		state.rows.users = [];

		expect(await sendTrialNotice({ restaurantId: 'rest-1', name: 'Casa Lua', milestone: 1, claim: '2026-08-01:1' })).toBe(false);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});
});

describe('runOverdueRemindersJob', () => {
	it('queues one job per tenant, keyed on the day', async () => {
		state.rows.restaurants = [tenant({ id: 'rest-1' }), tenant({ id: 'rest-2' })];
		const { boss, inserts } = fakeBoss();

		const result = await runOverdueRemindersJob(boss);
		const day = new Date().toISOString().slice(0, 10);

		expect(result).toEqual({ scanned: 2, considered: 2, dispatched: 2 });
		expect(inserts[0].queue).toBe(REMINDERS_TENANT_QUEUE);
		expect(jobsFor(inserts).map(j => j.singletonKey)).toEqual([`rest-1:${day}`, `rest-2:${day}`]);
		expect(jobsFor(inserts)[0].data).toMatchObject({ restaurantId: 'rest-1', day });
	});
});

describe('sendOverdueReminder', () => {
	const job = { restaurantId: 'rest-1', name: 'Casa Lua', day: '2026-08-20' };

	it('emails the overdue count and total once per day', async () => {
		state.rows.invoices = [{ count: 3, total: 1250.5 }];

		expect(await sendOverdueReminder(job)).toBe(true);
		expect(state.claimCalls[0]).toEqual({ key: 'overdue_reminder_sent_day', value: '2026-08-20' });
		const payload = sendEmailMock.mock.calls[0][0];
		expect(payload.kind).toBe('overdue_invoice');
		expect(payload.subject).toContain('3');
		expect(payload.html).toContain('1250.50 €');
	});

	it('sends nothing when nothing is overdue', async () => {
		state.rows.invoices = [{ count: 0, total: 0 }];

		expect(await sendOverdueReminder(job)).toBe(false);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(state.claimCalls).toEqual([]);
	});

	it('stays quiet for a tenant that switched invoice reminders off (issue #577)', async () => {
		state.rows.invoices = [{ count: 3, total: 1250.5 }];
		state.rows.settings = [{ key: 'alert_pref_invoice_reminders', value: 'false' }];

		expect(await sendOverdueReminder(job)).toBe(false);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(state.claimCalls).toEqual([]);
	});
});

describe('runWeeklyDigestJob', () => {
	it('queues only tiers whose plan includes the digest', async () => {
		state.rows.restaurants = [
			tenant({ id: 'rest-trial', planTier: 'trial' }),
			tenant({ id: 'rest-pro', planTier: 'pro', status: 'active' }),
		];
		const { boss, inserts } = fakeBoss();

		const result = await runWeeklyDigestJob(boss);

		expect(result).toEqual({ scanned: 2, considered: 1, dispatched: 1 });
		expect(inserts[0].queue).toBe(DIGEST_TENANT_QUEUE);
		expect(jobsFor(inserts)[0]).toMatchObject({
			data: { restaurantId: 'rest-pro', week: '2026-W30' },
			singletonKey: 'rest-pro:2026-W30',
		});
	});
});

describe('sendWeeklyDigest', () => {
	const job = { restaurantId: 'rest-pro', name: 'Casa Lua', week: '2026-W30' };

	it('generates the digest and emails the owner', async () => {
		expect(await sendWeeklyDigest(job)).toBe(true);

		expect(sendEmailMock).toHaveBeenCalledOnce();
		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ kind: 'weekly_digest' });
		expect(state.claimCalls[0]).toEqual({ key: 'weekly_digest_email_week', value: '2026-W30' });
	});

	it('sends nothing when the week was already claimed', async () => {
		state.claims = [false];

		expect(await sendWeeklyDigest(job)).toBe(false);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('stays quiet for a tenant that switched the weekly digest off (issue #577)', async () => {
		state.rows.settings = [{ key: 'alert_pref_weekly_digest', value: 'false' }];

		expect(await sendWeeklyDigest(job)).toBe(false);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(state.claimCalls).toEqual([]);
	});
});

describe('runFilePurgeJob', () => {
	it('deletes the stored file and clears the pointer', async () => {
		state.rows.invoices = [
			{ id: 1, restaurantId: 'rest-1', sourceFile: 'abc/one.pdf' },
			{ id: 2, restaurantId: 'rest-1', sourceFile: 'abc/two.jpg' },
		];

		expect(await runFilePurgeJob()).toEqual({ purged: 2, failed: 0 });
		expect(storageDeleteMock.mock.calls.map(c => c[0])).toEqual(['abc/one.pdf', 'abc/two.jpg']);
		expect(state.updates).toEqual([{ sourceFile: null }, { sourceFile: null }]);
	});

	it('keeps the pointer when the delete fails, so the next run retries it', async () => {
		state.rows.invoices = [{ id: 1, restaurantId: 'rest-1', sourceFile: 'abc/one.pdf' }];
		storageDeleteMock.mockRejectedValueOnce(new Error('bucket unreachable'));
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(await runFilePurgeJob()).toEqual({ purged: 0, failed: 1 });
		expect(state.updates).toEqual([]);
		spy.mockRestore();
	});

	it('keeps a 30-day undo window before purging', () => {
		expect(DELETED_FILE_RETENTION_DAYS).toBe(30);
	});
});

describe('runAnalyticsRefreshJob', () => {
	it('calls refresh_analytics_rollups() (issue #424)', async () => {
		const result = await runAnalyticsRefreshJob();

		expect(result).toEqual({ refreshed: true });
		expect(executeMock).toHaveBeenCalledOnce();
		const query = executeMock.mock.calls[0][0];
		expect(String(query.queryChunks[0].value[0])).toContain('refresh_analytics_rollups()');
	});
});

// Issue #486: a restaurant with no subscriptions row used to fail OPEN
// (getAccessState granted unlimited access). This nightly reconciliation is
// the repair half of the fix — it heals the gap so a legitimate orphan does
// not stay locked out forever once resolveAccessState fails closed.
describe('reconcileOrphanSubscriptions', () => {
	it('provisions a dated trial for every root restaurant with no subscription row', async () => {
		state.rows.restaurants = [{ id: 'rest-orphan-1' }, { id: 'rest-orphan-2' }];

		const result = await reconcileOrphanSubscriptions();

		expect(result).toEqual({ repaired: 2 });
		expect(state.subscriptionInserts).toHaveLength(2);
		for (const sub of state.subscriptionInserts) {
			expect(sub.status).toBe('trialing');
			expect(sub.trialEndsAt).toBeInstanceOf(Date);
			expect((sub.trialEndsAt as Date).getTime()).toBeGreaterThan(Date.now());
		}
		expect(state.subscriptionInserts.map(s => s.restaurantId)).toEqual(['rest-orphan-1', 'rest-orphan-2']);
	});

	it('does nothing when every restaurant already has a subscription row', async () => {
		state.rows.restaurants = [];

		expect(await reconcileOrphanSubscriptions()).toEqual({ repaired: 0 });
		expect(state.subscriptionInserts).toEqual([]);
	});

	it('is what the scheduled job runs', async () => {
		state.rows.restaurants = [{ id: 'rest-orphan-1' }];

		expect(await runOrphanSubscriptionsJob()).toEqual({ repaired: 1 });
	});
});
