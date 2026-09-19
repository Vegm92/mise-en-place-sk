/**
 * Application (Drizzle) queries emit no Sentry spans today — every
 * `span.op:db` row in Sentry is pg-boss housekeeping (issue #1077). This pins
 * the fix: `withQuerySpan` (`src/lib/server/db-client.ts`) wraps postgres.js's
 * `unsafe()` — the single call every Drizzle query (select/insert/update/
 * delete/raw `db.execute`) funnels through for both the pooled client and a
 * per-request reserved connection (ADR-030) — so it starts a span per query
 * when a request/job is already being traced, and is a true no-op otherwise:
 * no active span (including when Sentry was never initialized) skips
 * `startInactiveSpan` entirely and returns the original query unchanged.
 *
 * Two levels, deliberately kept apart:
 * 1. `withQuerySpan` in isolation, `@sentry/sveltekit` mocked — the wrapper's
 *    own contract (op, name, no bound values reach the span, no-op gate).
 * 2. A real query through the real, unmocked `db` module — proves the
 *    wrapper is actually wired into `getClient()`, not just correct in
 *    isolation. Exercises the `.values()` path specifically: any typed,
 *    column-mapped Drizzle query (everything except a raw
 *    `db.execute(sql\`…\`)`) goes through
 *    `drizzle-orm/postgres-js`'s `client.unsafe(query, params).values()`.
 *    That path is fragile — postgres.js's `Query.then()` calls `handle()`,
 *    which only dispatches the query after `await 1`, a one-microtask
 *    deferral that is the only reason `withQuerySpan`'s own
 *    `result.then(...)` (attached synchronously, before Drizzle's
 *    synchronous `.values()` call) doesn't race it. That ordering is
 *    undocumented postgres.js internals, not a public contract; this test
 *    is what would catch a future postgres.js release dropping it (a
 *    `.values()` query would start returning the wrong row shape, silently).
 *    DB-backed, skipped without DATABASE_URL like every other such suite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getActiveSpanMock, startInactiveSpanMock, spanEndMock } = vi.hoisted(() => ({
	getActiveSpanMock: vi.fn(),
	startInactiveSpanMock: vi.fn(),
	spanEndMock: vi.fn(),
}));

vi.mock('@sentry/sveltekit', () => ({
	getActiveSpan: getActiveSpanMock,
	startInactiveSpan: startInactiveSpanMock,
}));

import { eq } from 'drizzle-orm';
import { withQuerySpan } from '../src/lib/server/db-client';
import { hasDbEnv } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import { db } from '../src/lib/server/db';
import { restaurants } from '../src/lib/server/schema';

beforeEach(() => {
	vi.clearAllMocks();
	startInactiveSpanMock.mockReturnValue({ end: spanEndMock });
});

describe('withQuerySpan', () => {
	it('emits a span with op "db" and the parameterized query text, never the bound values, when a span is already active', async () => {
		getActiveSpanMock.mockReturnValue({});
		const params = ['secret@example.com', 42];
		const rows = [{ id: 1 }];
		const unsafe = vi.fn().mockResolvedValue(rows);
		const traced = withQuerySpan(unsafe);

		const result = await traced('select * from "invoices" where "email" = $1 and "id" = $2', params);

		expect(result).toBe(rows);
		expect(unsafe).toHaveBeenCalledWith('select * from "invoices" where "email" = $1 and "id" = $2', params);
		expect(startInactiveSpanMock).toHaveBeenCalledTimes(1);
		const spanArg = startInactiveSpanMock.mock.calls[0]![0];
		expect(spanArg.op).toBe('db');
		expect(spanArg.name).toBe('select * from "invoices" where "email" = $1 and "id" = $2');
		expect(spanArg.name).not.toContain('secret@example.com');
		expect(spanArg.name).not.toContain('42');
		expect(JSON.stringify(spanArg)).not.toContain('secret@example.com');
		await vi.waitFor(() => expect(spanEndMock).toHaveBeenCalledTimes(1));
	});

	it('is a no-op when there is no active span — including when Sentry was never configured', async () => {
		getActiveSpanMock.mockReturnValue(undefined);
		const rows = [{ id: 1 }];
		const unsafe = vi.fn().mockResolvedValue(rows);
		const traced = withQuerySpan(unsafe);

		const result = await traced('select 1', []);

		expect(result).toBe(rows);
		expect(startInactiveSpanMock).not.toHaveBeenCalled();
	});
});

const restaurant = useTestRestaurant('query-span-1077');

describe.skipIf(!hasDbEnv)('withQuerySpan wired into the real db module (issue #1077 follow-up)', () => {
	it('emits a real span for a typed select — the .values() path Drizzle uses for column-mapped queries', async () => {
		getActiveSpanMock.mockReturnValue({});

		const rows = await db
			.select({ id: restaurants.id, name: restaurants.name })
			.from(restaurants)
			.where(eq(restaurants.id, restaurant.id));

		expect(rows).toEqual([{ id: restaurant.id, name: expect.any(String) }]);
		expect(startInactiveSpanMock).toHaveBeenCalled();
		const spanArg = startInactiveSpanMock.mock.calls.at(-1)![0];
		expect(spanArg.op).toBe('db');
		expect(spanArg.name).toContain('restaurants');
		await vi.waitFor(() => expect(spanEndMock).toHaveBeenCalled());
	});
});
