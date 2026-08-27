/**
 * /pending queue position — Drizzle ms-truncation vs Postgres µs (issue #744).
 *
 * Postgres stores users.created_at with microsecond precision, but Drizzle
 * hands back a JS Date truncated to milliseconds. The old query compared
 * `lte(users.createdAt, me.createdAt)` using that truncated value, so a row
 * whose real (µs) timestamp sits between the truncated ms and the next ms
 * tick — e.g. stored .374295, compared against .374 — never matched itself,
 * undercounting the position by one (0 for the very first user in the queue).
 *
 * db is mocked and the captured `where()` argument is rendered with drizzle's
 * own dialect, so this asserts the real predicate (strict `<`, not `<=`)
 * without needing a database, and separately proves the count-of-earlier-rows
 * math yields position 1 for the first user rather than 0.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const { state } = vi.hoisted(() => ({
	state: {
		meRows: [] as unknown[],
		countQueue: [] as unknown[][],
		whereArgs: [] as unknown[],
	},
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: (fields: Record<string, unknown>) => ({
			from: () => ({
				where: (arg: unknown) => {
					if ('createdAt' in fields) {
						// select({ createdAt }).from(users).where(eq(id, userId)).limit(1)
						return { limit: () => Promise.resolve(state.meRows) };
					}
					// select({ n: count() }).from(users).where(...) — awaited directly.
					state.whereArgs.push(arg);
					return Promise.resolve(state.countQueue.shift() ?? []);
				},
			}),
		}),
	},
}));

const dialect = new PgDialect();
const render = (arg: unknown) => dialect.sqlToQuery(arg as SQL);

async function runLoad() {
	const { load } = await import('../src/routes/pending/+page.server');
	return load({
		locals: { user: { id: 'u1', email: 'a@b.example' }, accessApproved: false },
	} as never) as Promise<{ queuePosition: number | null; queueTotal: number | null }>;
}

beforeEach(() => {
	state.meRows = [];
	state.countQueue = [];
	state.whereArgs = [];
});

describe('/pending load() — queue position', () => {
	it('is immune to ms-truncated createdAt: the first user in the queue is position 1, not 0', async () => {
		// Drizzle would hand back a Date truncated to milliseconds even though
		// Postgres stored e.g. .374295 — this is that truncated value.
		state.meRows = [{ createdAt: new Date('2026-01-01T00:00:00.374Z') }];
		// No pending row is strictly earlier than the first user's own row.
		state.countQueue = [[{ n: 0 }], [{ n: 0 }], [{ n: 0 }]]; // waiting, approved, ahead

		const result = await runLoad();

		expect(result.queuePosition).toBe(1);
	});

	it('adds one to the count of strictly-earlier rows for a later signup', async () => {
		state.meRows = [{ createdAt: new Date('2026-01-02T00:00:00.500Z') }];
		state.countQueue = [[{ n: 5 }], [{ n: 2 }], [{ n: 3 }]]; // waiting, approved, ahead

		const result = await runLoad();

		expect(result.queuePosition).toBe(4);
		expect(result.queueTotal).toBe(5);
	});

	it('uses a strict "<" predicate on created_at, not "<=" — the fix for the truncation bug', async () => {
		state.meRows = [{ createdAt: new Date('2026-01-01T00:00:00.374Z') }];
		state.countQueue = [[{ n: 0 }], [{ n: 0 }], [{ n: 0 }]];

		await runLoad();

		// whereArgs: [0]=waiting, [1]=approved, [2]=ahead (position predicate)
		const aheadWhere = render(state.whereArgs[2]);
		expect(aheadWhere.sql).toContain('"created_at" <');
		expect(aheadWhere.sql).not.toContain('"created_at" <=');
	});
});
