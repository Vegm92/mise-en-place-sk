/**
 * Per-tenant fan-out for the scheduled jobs (issue #518).
 *
 * The cron jobs used to load every tenant into memory and walk them one at a
 * time, so a slow tenant blocked everyone behind it and a job that only got
 * halfway still reported success. What is under test here is the replacement:
 * keyset pagination that never holds more than one page, one pg-boss job per
 * tenant, and per-job settlement so one tenant's failure cannot take the rest
 * of the batch down with it.
 *
 * db is mocked; the tenant table is replayed from a fixture and the keyset
 * cursor is read back out of the drizzle `where` expression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';
import type { JobResult, JobWithMetadata, PgBoss } from 'pg-boss';

const { state } = vi.hoisted(() => ({
	state: {
		tenants: [] as Array<Record<string, unknown>>,
		flagRows: [] as Array<{ key: string; value: string }>,
		queries: [] as Array<{ afterId: string | null; limit: number }>,
		writes: [] as Array<{ key: string; value: string }>,
	},
}));

vi.mock('$lib/server/db', () => {
	const cursorOf = (expr: unknown): string | null => {
		const chunks = (expr as { queryChunks?: unknown[] })?.queryChunks ?? [];
		for (const chunk of chunks) {
			const value = (chunk as { value?: unknown })?.value;
			if (typeof value === 'string') return value;
		}
		return null;
	};

	const tenantQuery = () => {
		const q = { afterId: null as string | null, limit: 0 };
		const p: Record<string, unknown> = {};
		p.leftJoin = () => p;
		p.orderBy = () => p;
		p.where = (expr: unknown) => {
			q.afterId = expr ? cursorOf(expr) : null;
			return p;
		};
		p.limit = (n: number) => {
			q.limit = n;
			return p;
		};
		p.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
			Promise.resolve().then(() => {
				state.queries.push({ ...q });
				const start = q.afterId
					? state.tenants.findIndex(t => t.id === q.afterId) + 1
					: 0;
				return state.tenants.slice(start, start + q.limit);
			}).then(res, rej);
		return p;
	};

	const flagQuery = () => {
		const p: Record<string, unknown> = {};
		p.where = () => p;
		p.limit = () => p;
		p.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
			Promise.resolve().then(() => state.flagRows).then(res, rej);
		return p;
	};

	const db = {
		select: () => ({
			from: (table: never) => (getTableName(table) === 'app_flags' ? flagQuery() : tenantQuery()),
		}),
		insert: () => ({
			values: (values: { key: string; value: string }) => ({
				onConflictDoUpdate: () => {
					state.writes.push(values);
					return Promise.resolve([]);
				},
			}),
		}),
	};
	return { db, forTenant: (rid: string) => ({ rid, scope: () => ({}) }), runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import {
	dispatchTenantJobs,
	lastJobRuns,
	registerTenantFanout,
	tenantPage,
	TENANT_PAGE_SIZE,
	type TenantJobData,
} from '../src/lib/server/tenant-fanout';

interface InsertedJob {
	data: TenantJobData;
	singletonKey: string;
	deadLetter: string;
}

function tenants(n: number, prefix = 'rest'): Array<Record<string, unknown>> {
	return Array.from({ length: n }, (_, i) => ({
		id: `${prefix}-${String(i).padStart(5, '0')}`,
		name: `Tenant ${i}`,
		planTier: 'pro',
		status: 'active',
		trialEndsAt: null,
	}));
}

function fakeBoss(insertedIds?: (jobs: InsertedJob[]) => string[]) {
	const inserts: Array<{ queue: string; jobs: InsertedJob[] }> = [];
	const boss = {
		insert: vi.fn(async (queue: string, jobs: InsertedJob[]) => {
			inserts.push({ queue, jobs });
			return insertedIds ? insertedIds(jobs) : jobs.map((_, i) => `job-${inserts.length}-${i}`);
		}),
	};
	return { boss: boss as unknown as PgBoss, inserts };
}

const SPEC = {
	queue: 'tenant-test',
	label: 'test-job',
	jobFor: (tenant: { id: string; name: string }) => ({
		data: { restaurantId: tenant.id, name: tenant.name },
		singletonKey: tenant.id,
	}),
};

beforeEach(() => {
	state.tenants = [];
	state.flagRows = [];
	state.queries = [];
	state.writes = [];
});

describe('tenantPage', () => {
	it('reads one bounded page and starts after the cursor', async () => {
		state.tenants = tenants(10);

		const first = await tenantPage(null, 4);
		const second = await tenantPage(first[first.length - 1].id, 4);

		expect(first.map(t => t.id)).toEqual(['rest-00000', 'rest-00001', 'rest-00002', 'rest-00003']);
		expect(second.map(t => t.id)).toEqual(['rest-00004', 'rest-00005', 'rest-00006', 'rest-00007']);
		expect(state.queries).toEqual([
			{ afterId: null, limit: 4 },
			{ afterId: 'rest-00003', limit: 4 },
		]);
	});

	it('defaults tenants with no subscription row to the trial tier', async () => {
		state.tenants = [{ id: 'rest-1', name: 'Casa Lua', planTier: null, status: null, trialEndsAt: null }];

		expect(await tenantPage(null)).toEqual([
			{ id: 'rest-1', name: 'Casa Lua', planTier: 'trial', status: 'trialing', trialEndsAt: null },
		]);
	});
});

describe('dispatchTenantJobs', () => {
	it('queues one job per tenant and reports what it dispatched', async () => {
		state.tenants = tenants(3);
		const { boss, inserts } = fakeBoss();

		const result = await dispatchTenantJobs(boss, SPEC);

		expect(result).toEqual({ scanned: 3, considered: 3, dispatched: 3 });
		expect(inserts).toHaveLength(1);
		expect(inserts[0].queue).toBe('tenant-test');
		expect(inserts[0].jobs[0]).toMatchObject({
			data: { restaurantId: 'rest-00000' },
			singletonKey: 'rest-00000',
			deadLetter: 'tenant-test-dead-letter',
		});
	});

	it('walks the whole table one page at a time, never holding it all (5k tenants)', async () => {
		state.tenants = tenants(5_000);
		const { boss, inserts } = fakeBoss();

		const result = await dispatchTenantJobs(boss, SPEC);

		expect(result).toEqual({ scanned: 5_000, considered: 5_000, dispatched: 5_000 });
		expect(state.queries).toHaveLength(Math.ceil(5_000 / TENANT_PAGE_SIZE) + 1);
		expect(state.queries.every(q => q.limit === TENANT_PAGE_SIZE)).toBe(true);
		expect(inserts.every(i => i.jobs.length <= TENANT_PAGE_SIZE)).toBe(true);
		expect(state.queries[1].afterId).toBe(`rest-${String(TENANT_PAGE_SIZE - 1).padStart(5, '0')}`);
	});

	it('stops as soon as a page comes back short', async () => {
		state.tenants = tenants(3);
		const { boss } = fakeBoss();

		await dispatchTenantJobs(boss, { ...SPEC, pageSize: 10 });

		expect(state.queries).toHaveLength(1);
	});

	it('skips tenants the job does not apply to without enqueueing them', async () => {
		state.tenants = tenants(4);
		const { boss, inserts } = fakeBoss();

		const result = await dispatchTenantJobs(boss, {
			...SPEC,
			jobFor: (tenant) => tenant.id.endsWith('1')
				? { data: { restaurantId: tenant.id, name: tenant.name }, singletonKey: tenant.id }
				: null,
		});

		expect(result).toEqual({ scanned: 4, considered: 1, dispatched: 1 });
		expect(inserts[0].jobs.map(j => j.data.restaurantId)).toEqual(['rest-00001']);
	});

	it('counts a job pg-boss deduped as not dispatched', async () => {
		state.tenants = tenants(3);
		const { boss } = fakeBoss(jobs => jobs.slice(1).map((_, i) => `job-${i}`));

		expect(await dispatchTenantJobs(boss, SPEC)).toEqual({ scanned: 3, considered: 3, dispatched: 2 });
	});

	it('still records what it managed to dispatch when a page fails', async () => {
		state.tenants = tenants(400);
		const boss = {
			insert: vi.fn(async (_queue: string, jobs: InsertedJob[]) => {
				if (boss.insert.mock.calls.length > 1) throw new Error('connection reset');
				return jobs.map((_, i) => `job-${i}`);
			}),
		};

		await expect(dispatchTenantJobs(boss as unknown as PgBoss, SPEC)).rejects.toThrow('connection reset');

		expect(JSON.parse(state.writes[0].value)).toMatchObject({ scanned: 400, considered: 400, dispatched: 200 });
	});

	it('records the run so a dispatch that covered half the tenants is visible', async () => {
		state.tenants = tenants(2);
		const { boss } = fakeBoss();

		await dispatchTenantJobs(boss, SPEC);

		expect(state.writes).toHaveLength(1);
		expect(state.writes[0].key).toBe('job_run:test-job');
		expect(JSON.parse(state.writes[0].value)).toMatchObject({ scanned: 2, considered: 2, dispatched: 2 });
	});
});

describe('lastJobRuns', () => {
	it('reads back every recorded run summary', async () => {
		state.flagRows = [
			{ key: 'job_run:weekly-digest', value: JSON.stringify({ at: '2026-08-24T06:00:00.000Z', scanned: 9, considered: 4, dispatched: 4 }) },
			{ key: 'job_run:broken', value: 'not json' },
		];

		expect(await lastJobRuns()).toEqual([
			{ label: 'weekly-digest', at: '2026-08-24T06:00:00.000Z', scanned: 9, considered: 4, dispatched: 4 },
		]);
	});
});

describe('registerTenantFanout', () => {
	function recordingBoss() {
		const created: Array<{ name: string; options?: Record<string, unknown> }> = [];
		const workers: Record<string, { options: Record<string, unknown>; handler: (jobs: unknown[]) => Promise<unknown> }> = {};
		const boss = {
			createQueue: vi.fn(async (name: string, options?: Record<string, unknown>) => { created.push({ name, options }); }),
			updateQueue: vi.fn(async () => {}),
			work: vi.fn(async (name: string, options: Record<string, unknown>, handler: (jobs: unknown[]) => Promise<unknown>) => {
				workers[name] = { options, handler };
				return name;
			}),
		};
		return { boss: boss as unknown as PgBoss, created, workers };
	}

	function job(id: string, restaurantId: string): JobWithMetadata<TenantJobData> {
		return { id, data: { restaurantId, name: restaurantId } } as JobWithMetadata<TenantJobData>;
	}

	it('creates the queue with its dead letter and a per-job worker', async () => {
		const { boss, created, workers } = recordingBoss();

		await registerTenantFanout(boss, { queue: 'tenant-test', label: 'test-job', run: async () => true });

		expect(created.map(c => c.name)).toEqual(['tenant-test-dead-letter', 'tenant-test']);
		expect(created[1].options).toMatchObject({ policy: 'short', deadLetter: 'tenant-test-dead-letter' });
		expect(workers['tenant-test'].options).toMatchObject({ perJobResults: true, includeMetadata: true });
		expect(workers['tenant-test-dead-letter']).toBeDefined();
	});

	it('settles each tenant on its own, so one failure cannot sink the batch', async () => {
		const { boss, workers } = recordingBoss();
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const seen: string[] = [];

		await registerTenantFanout(boss, {
			queue: 'tenant-test',
			label: 'test-job',
			run: async (data: TenantJobData) => {
				seen.push(data.restaurantId);
				if (data.restaurantId === 'rest-2') throw new Error('Resend is throttling us');
				return data.restaurantId === 'rest-1';
			},
		});

		const results = await workers['tenant-test'].handler([
			job('job-1', 'rest-1'),
			job('job-2', 'rest-2'),
			job('job-3', 'rest-3'),
		]) as JobResult[];

		expect(seen).toEqual(['rest-1', 'rest-2', 'rest-3']);
		expect(results).toEqual([
			{ id: 'job-1', status: 'completed', output: { sent: true } },
			{ id: 'job-2', status: 'failed', output: { error: 'Error: Resend is throttling us' } },
			{ id: 'job-3', status: 'completed', output: { sent: false } },
		]);
		spy.mockRestore();
	});

	it('runs a batch concurrently, so one slow tenant does not serialize the rest', async () => {
		const { boss, workers } = recordingBoss();
		const finishOrder: string[] = [];
		let inFlight = 0;
		let maxInFlight = 0;

		await registerTenantFanout(boss, {
			queue: 'tenant-test',
			label: 'test-job',
			run: async (data: TenantJobData) => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				if (data.restaurantId === 'rest-slow') {
					await new Promise((resolve) => setTimeout(resolve, 30));
				}
				inFlight--;
				finishOrder.push(data.restaurantId);
				return true;
			},
		});

		await workers['tenant-test'].handler([
			job('job-1', 'rest-slow'),
			job('job-2', 'rest-fast-1'),
			job('job-3', 'rest-fast-2'),
		]);

		expect(maxInFlight).toBeGreaterThan(1);
		expect(finishOrder.indexOf('rest-slow')).toBe(finishOrder.length - 1);
	});
});
