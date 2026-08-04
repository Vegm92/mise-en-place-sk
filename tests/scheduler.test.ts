/**
 * Scheduled jobs (issues #288 / #289).
 *
 * These emails only matter for tenants who stopped opening the app, so the
 * behaviour under test is: the right tenants are picked, each notice is sent
 * exactly once (the claim is what makes a retried job safe), and the file purge
 * both deletes the object and stops the row pointing at it.
 *
 * db, storage, and Resend are mocked; the drizzle query builders are
 * replayed against per-table fixtures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';

const { state, sendEmailMock, storageDeleteMock } = vi.hoisted(() => ({
	state: {
		// rows returned for a select from each table, by table name. A function
		// value is invoked per call instead of returned directly.
		rows: {} as Record<string, unknown[] | (() => unknown[])>,
		// claimOnce results, in call order (true = first time this value is stored)
		claims: [] as boolean[],
		claimCalls: [] as Array<{ key: string; value: string }>,
		updates: [] as Array<Record<string, unknown>>,
	},
	sendEmailMock: vi.fn().mockResolvedValue(undefined),
	storageDeleteMock: vi.fn().mockResolvedValue(undefined),
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

	const db = {
		select: () => chain(() => []),
		insert: () => ({
			values: (values: { key: string; value: string }) => ({
				onConflictDoUpdate: () => ({
					returning: () => {
						state.claimCalls.push({ key: values.key, value: values.value });
						const granted = state.claims.shift() ?? true;
						return Promise.resolve(granted ? [{ value: values.value }] : []);
					},
				}),
			}),
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
	getOrGenerateWeeklyDigest: vi.fn().mockResolvedValue({ text: 'Gasto estable.\n\nRecommended: nada.', dismissed: false }),
}));

import {
	trialDaysLeft,
	trialMilestoneFor,
	runTrialNoticesJob,
	runOverdueRemindersJob,
	runWeeklyDigestJob,
	runFilePurgeJob,
	DELETED_FILE_RETENTION_DAYS,
} from '../src/lib/server/scheduler';

const DAY = 86_400_000;

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
	};
	state.claims = [];
	state.claimCalls = [];
	state.updates = [];
	sendEmailMock.mockClear();
	storageDeleteMock.mockClear().mockResolvedValue(undefined);
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
	it('emails the owner once per milestone, keyed on the trial end date', async () => {
		const endsAt = new Date(Date.now() + 7 * DAY);
		state.rows.restaurants = [tenant({ trialEndsAt: endsAt })];

		const result = await runTrialNoticesJob();

		expect(result).toEqual({ considered: 1, sent: 1 });
		expect(state.claimCalls[0]).toEqual({
			key: 'trial_notice_sent',
			value: `${endsAt.toISOString().slice(0, 10)}:7`,
		});
		expect(sendEmailMock).toHaveBeenCalledOnce();
		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ kind: 'trial_expiry', to: 'owner@example.com' });
	});

	it('sends nothing when the milestone was already claimed', async () => {
		state.rows.restaurants = [tenant()];
		state.claims = [false];

		expect(await runTrialNoticesJob()).toEqual({ considered: 1, sent: 0 });
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('uses the lapsed template once the trial has ended', async () => {
		state.rows.restaurants = [tenant({ trialEndsAt: new Date(Date.now() - 2 * DAY) })];

		await runTrialNoticesJob();

		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ kind: 'trial_expired' });
	});

	it('ignores tenants that are not on a trial', async () => {
		state.rows.restaurants = [tenant({ status: 'active', planTier: 'pro' })];

		expect(await runTrialNoticesJob()).toEqual({ considered: 0, sent: 0 });
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('keeps going when one tenant fails', async () => {
		state.rows.restaurants = [tenant({ id: 'rest-1' }), tenant({ id: 'rest-2' })];
		let call = 0;
		state.rows.users = () => {
			call++;
			if (call === 1) throw new Error('db down');
			return [{ id: 'user-1', email: 'owner2@example.com' }];
		};
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(await runTrialNoticesJob()).toEqual({ considered: 2, sent: 1 });
		spy.mockRestore();
	});
});

describe('runOverdueRemindersJob', () => {
	it('emails the overdue count and total once per day', async () => {
		state.rows.restaurants = [tenant()];
		state.rows.invoices = [{ count: 3, total: 1250.5 }];

		expect(await runOverdueRemindersJob()).toEqual({ considered: 1, sent: 1 });
		expect(state.claimCalls[0].key).toBe('overdue_reminder_sent_day');
		const payload = sendEmailMock.mock.calls[0][0];
		expect(payload.kind).toBe('overdue_invoice');
		expect(payload.subject).toContain('3');
		expect(payload.html).toContain('1250.50 €');
	});

	it('sends nothing when nothing is overdue', async () => {
		state.rows.restaurants = [tenant()];
		state.rows.invoices = [{ count: 0, total: 0 }];

		expect(await runOverdueRemindersJob()).toEqual({ considered: 1, sent: 0 });
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(state.claimCalls).toEqual([]);
	});
});

describe('runWeeklyDigestJob', () => {
	it('emails only tiers whose plan includes the digest', async () => {
		state.rows.restaurants = [
			tenant({ id: 'rest-trial', planTier: 'trial' }),
			tenant({ id: 'rest-pro', planTier: 'pro', status: 'active' }),
		];

		const result = await runWeeklyDigestJob();

		expect(result).toEqual({ considered: 1, sent: 1 });
		expect(sendEmailMock).toHaveBeenCalledOnce();
		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ kind: 'weekly_digest' });
		expect(state.claimCalls[0]).toEqual({ key: 'weekly_digest_email_week', value: '2026-W30' });
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
