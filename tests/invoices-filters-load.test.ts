/**
 * /invoices `load()` reads its filter state from the URL (issue #579).
 *
 * Instant-apply filters mean the URL is the only filter state there is: the
 * client rewrites the query string and the server has to turn it back into SQL
 * predicates on both the page query and the row-count query. db is mocked and
 * the captured `where()` arguments are rendered with drizzle's own dialect, so
 * these assert the real predicates without needing a database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const { state } = vi.hoisted(() => ({
	state: {
		scopedTo: null as string | null,
		whereArgs: [] as unknown[],
		limit: null as number | null,
		offset: null as number | null,
	},
}));

vi.mock('$lib/server/db', async () => {
	const { forTenant } = await import('../src/lib/server/tenant');
	const chain = () => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy']) p[m] = () => p;
		p.where = (arg: unknown) => {
			state.whereArgs.push(arg);
			return p;
		};
		p.limit = (n: number) => {
			state.limit = n;
			return p;
		};
		p.offset = (n: number) => {
			state.offset = n;
			return p;
		};
		p.then = (res: (v: unknown) => unknown) => Promise.resolve([]).then(res);
		return p;
	};
	return {
		db: { select: () => chain(), execute: async () => [] },
		forTenant: (rid: string) => {
			state.scopedTo = rid;
			return forTenant(rid);
		},
	};
});

vi.mock('$lib/server/events', () => ({ trackEvent: vi.fn() }));
vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: vi.fn(async () => true) }));
vi.mock('$lib/server/invoice-status', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/lib/server/invoice-status')>()),
	markInvoiceReviewed: vi.fn(),
	markInvoicesReviewedBulk: vi.fn(),
}));

const RID = '11111111-1111-1111-1111-111111111111';
const dialect = new PgDialect();
const render = (arg: unknown) => dialect.sqlToQuery(arg as SQL);

async function runLoad(qs: string) {
	const { load } = await import('../src/routes/(app)/invoices/+page.server');
	return (await load({
		url: new URL(`https://app.test/invoices${qs}`),
		locals: { restaurantId: RID },
	} as never)) as {
		filters: Record<string, string>;
		activeFilterCount: number;
		pagination: { page: number; pageSize: number };
	};
}

beforeEach(() => {
	state.scopedTo = null;
	state.whereArgs = [];
	state.limit = null;
	state.offset = null;
});

describe('/invoices load() — filters come from the search params', () => {
	it('returns the parsed filter set and its active count', async () => {
		const result = await runLoad(
			'?q=tomate&status=por_revisar&supplier_id=42&date_from=2026-01-01&date_to=2026-01-31' +
			'&uploaded_from=2026-02-01&uploaded_to=2026-02-28&sort=invoice_date_asc'
		);

		expect(result.filters).toEqual({
			q: 'tomate',
			status: 'por_revisar',
			supplier_id: '42',
			category: '',
			date_from: '2026-01-01',
			date_to: '2026-01-31',
			uploaded_from: '2026-02-01',
			uploaded_to: '2026-02-28',
			sort: 'invoice_date_asc',
		});
		expect(result.activeFilterCount).toBe(8);
	});

	it('reports no active filters for a bare /invoices', async () => {
		const result = await runLoad('');
		expect(result.activeFilterCount).toBe(0);
		expect(result.filters.q).toBe('');
		expect(result.filters.sort).toBe('uploaded_desc');
	});

	it('turns each search param into a predicate on the page query', async () => {
		await runLoad(
			'?q=tomate&status=por_revisar&supplier_id=42&date_from=2026-01-01&date_to=2026-01-31' +
			'&uploaded_from=2026-02-01&uploaded_to=2026-02-28'
		);

		expect(state.scopedTo).toBe(RID);
		const listWhere = render(state.whereArgs[0]);
		expect(listWhere.sql).toContain('"restaurant_id"');
		expect(listWhere.sql).toContain('"deleted_at" is null');
		expect(listWhere.sql).toContain('"review_state" =');
		expect(listWhere.sql).toContain('"supplier_id" =');
		expect(listWhere.sql).toContain('"invoice_date" >=');
		expect(listWhere.sql).toContain('"invoice_date" <=');
		expect(listWhere.sql).toContain('"created_at" >=');
		expect(listWhere.sql).toContain('"created_at" <=');
		expect(listWhere.params).toContain(RID);
		expect(listWhere.params).toContain('por_revisar');
		expect(listWhere.params).toContain(42);
		expect(listWhere.params).toContain('2026-01-01');
		expect(listWhere.params).toContain('2026-01-31');
	});

	it('refuses a status outside the review vocabulary instead of querying for it', async () => {
		await runLoad('?status=paid');
		const listWhere = render(state.whereArgs[0]);

		expect(listWhere.sql).toContain('false');
		expect(listWhere.params).not.toContain('paid');
	});

	it('filters by supplier category on both the page and row-count queries', async () => {
		await runLoad('?category=L%C3%A1cteos');
		const listWhere = render(state.whereArgs[0]);
		expect(listWhere.sql).toContain('"category" =');
		expect(listWhere.params).toContain('Lácteos');
		const countWhere = render(state.whereArgs[state.whereArgs.length - 1]);
		expect(countWhere.params).toContain('Lácteos');
	});

	it('searches invoice number and supplier name for the text query', async () => {
		await runLoad('?q=tomate');
		const listWhere = render(state.whereArgs[0]);
		expect(listWhere.sql.toLowerCase()).toContain('ilike');
		expect(listWhere.sql).toContain('"invoice_number"');
		expect(listWhere.sql).toContain('"name"');
		expect(listWhere.params).toContain('%tomate%');
	});

	it('treats LIKE wildcards in the text query as literal characters', async () => {
		await runLoad('?q=100%25');
		const listWhere = render(state.whereArgs[0]);
		expect(listWhere.params).toContain('%100\\%%');
	});

	it('applies the same filters to the row-count query as to the page query', async () => {
		await runLoad('?q=tomate&status=revisado&supplier_id=7');
		const countWhere = render(state.whereArgs[state.whereArgs.length - 1]);
		expect(countWhere.params).toContain(RID);
		expect(countWhere.params).toContain('revisado');
		expect(countWhere.params).toContain(7);
		expect(countWhere.params).toContain('%tomate%');
	});

	it('ignores a malformed date instead of pushing it into SQL', async () => {
		const result = await runLoad('?date_from=ayer&date_to=2026-02-30');
		expect(result.filters.date_from).toBe('');
		expect(result.filters.date_to).toBe('');
		const listWhere = render(state.whereArgs[0]);
		expect(listWhere.sql).not.toContain('"invoice_date"');
		expect(listWhere.params).not.toContain('ayer');
	});

	it('falls back to the default sort for an unknown sort key', async () => {
		const result = await runLoad('?sort=; DROP TABLE invoices');
		expect(result.filters.sort).toBe('uploaded_desc');
	});

	it('pages through the filtered set from the page param', async () => {
		const result = await runLoad('?status=revisado&page=3');
		expect(result.pagination.page).toBe(3);
		expect(state.limit).toBe(result.pagination.pageSize);
		expect(state.offset).toBe(result.pagination.pageSize * 2);
	});
});
