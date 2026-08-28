/**
 * Issue #542: /invoice/[id] (and its siblings /invoice/[id]/edit,
 * /invoice/[id]/file, /products/[id], /suppliers/[id]) threw an unhandled
 * Postgres integer-cast error for any non-integer id — 500, not 400/404 —
 * because the route handed `Number(params.id)` straight to a query without
 * validating it first. `NaN` reaches the query for a malformed id, and
 * Postgres rejects the cast; the driver error isn't an SvelteKit HttpError,
 * so it escapes as an unhandled 500 (or, under `handleLoad`, a generic 500).
 *
 * The fix is `requirePositiveIntId()` (`$lib/server/route-params.ts`),
 * applied as the first statement of every loader and action on these
 * routes: a malformed id is rejected with a clean `error(400, ...)` before
 * any query runs. These tests drive the real loaders/actions with the db
 * module replaced by a call-recording stub, so a route that regressed back
 * to querying with a malformed id would surface as either an unhandled
 * driver-shaped rejection (not `isHttpError(e, 400)`) or a recorded db call
 * — both of which the assertions below catch.
 *
 * /batch/[id]'s id is a UUID column; `getBatchItems()` already short-circuits
 * a non-UUID batchId to `[]` before ever touching the db (`$lib/server/batch.ts`),
 * which the existing ownership guard then turns into the same redirect as a
 * missing batch. A regression test below pins that this stays true and never
 * degrades into a raw cast error.
 *
 * No DB needed — db is fully mocked, so this runs everywhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';

const { dbState } = vi.hoisted(() => ({
	dbState: { calls: [] as string[] },
}));

function chain(): Record<string, unknown> {
	return new Proxy(
		{},
		{
			get(_t, prop) {
				if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve([]);
				if (typeof prop !== 'string') return undefined;
				dbState.calls.push(prop);
				return (..._args: unknown[]) => chain();
			},
		},
	) as Record<string, unknown>;
}

function txStub() {
	return {
		select: (..._a: unknown[]) => { dbState.calls.push('tx.select'); return chain(); },
		insert: (..._a: unknown[]) => { dbState.calls.push('tx.insert'); return chain(); },
		update: (..._a: unknown[]) => { dbState.calls.push('tx.update'); return chain(); },
		delete: (..._a: unknown[]) => { dbState.calls.push('tx.delete'); return chain(); },
		execute: async (..._a: unknown[]) => { dbState.calls.push('tx.execute'); return []; },
	};
}

vi.mock('$lib/server/db', async () => {
	const { forTenant } = await import('../src/lib/server/tenant');
	return {
		forTenant,
		db: {
			select: (..._a: unknown[]) => { dbState.calls.push('select'); return chain(); },
			insert: (..._a: unknown[]) => { dbState.calls.push('insert'); return chain(); },
			update: (..._a: unknown[]) => { dbState.calls.push('update'); return chain(); },
			delete: (..._a: unknown[]) => { dbState.calls.push('delete'); return chain(); },
			execute: async (..._a: unknown[]) => { dbState.calls.push('execute'); return []; },
			transaction: async (fn: (tx: unknown) => unknown) => {
				dbState.calls.push('transaction');
				return fn(txStub());
			},
		},
	};
});

const RID = '11111111-1111-1111-1111-111111111111';
const SENTINEL = new Error('__formdata-reached__');

function sentinelRequest() {
	const formData = vi.fn(async () => {
		throw SENTINEL;
	});
	return { request: { formData }, formData };
}

const MALFORMED_IDS = [
	'11111111-1111-1111-1111-111111111111',
	'not-a-uuid',
	"1' OR '1'='1",
	'0',
	'-1',
];

type RouteCase = {
	name: string;
	label: string;
	uses: 'db' | 'sentinel';
	run: (id: string, opts: { sentinel?: ReturnType<typeof sentinelRequest> }) => Promise<unknown>;
	validEvent: () => { id: string; sentinel?: ReturnType<typeof sentinelRequest> };
};

async function invoiceDetail() {
	return import('../src/routes/(app)/invoice/[id]/+page.server');
}
async function invoiceEdit() {
	return import('../src/routes/(app)/invoice/[id]/edit/+page.server');
}
async function invoiceFile() {
	return import('../src/routes/(app)/invoice/[id]/file/+server');
}
async function productDetail() {
	return import('../src/routes/(app)/products/[id]/+page.server');
}
async function supplierDetail() {
	return import('../src/routes/(app)/suppliers/[id]/+page.server');
}

const ROUTES: RouteCase[] = [
	{
		name: '/invoice/[id] load',
		label: 'invoice',
		uses: 'db',
		run: async (id) => (await invoiceDetail()).load({ params: { id }, locals: { restaurantId: RID } } as never),
		validEvent: () => ({ id: '5' }),
	},
	{
		name: '/invoice/[id] action relinkProducts',
		label: 'invoice',
		uses: 'db',
		run: async (id) =>
			(await invoiceDetail()).actions.relinkProducts({ params: { id }, locals: { restaurantId: RID } } as never),
		validEvent: () => ({ id: '5' }),
	},
	{
		name: '/invoice/[id] action delete',
		label: 'invoice',
		uses: 'db',
		run: async (id) =>
			(await invoiceDetail()).actions.delete(
				{ params: { id }, locals: { restaurantId: RID, user: { id: 'u1' } } } as never,
			),
		validEvent: () => ({ id: '5' }),
	},
	{
		name: '/invoice/[id]/edit load',
		label: 'invoice',
		uses: 'db',
		run: async (id) => (await invoiceEdit()).load({ params: { id }, locals: { restaurantId: RID } } as never),
		validEvent: () => ({ id: '5' }),
	},
	{
		name: '/invoice/[id]/edit action save',
		label: 'invoice',
		uses: 'sentinel',
		run: async (id, { sentinel }) =>
			(await invoiceEdit()).actions.save(
				{
					params: { id },
					locals: { restaurantId: RID, user: { id: 'u1' } },
					request: sentinel!.request,
				} as never,
			),
		validEvent: () => ({ id: '5', sentinel: sentinelRequest() }),
	},
	{
		name: '/invoice/[id]/file GET',
		label: 'invoice',
		uses: 'db',
		run: async (id) => (await invoiceFile()).GET({ params: { id }, locals: { restaurantId: RID } } as never),
		validEvent: () => ({ id: '5' }),
	},
	{
		name: '/products/[id] load',
		label: 'product',
		uses: 'db',
		run: async (id) => (await productDetail()).load({ params: { id }, locals: { restaurantId: RID } } as never),
		validEvent: () => ({ id: '5' }),
	},
	{
		name: '/products/[id] action update',
		label: 'product',
		uses: 'sentinel',
		run: async (id, { sentinel }) =>
			(await productDetail()).actions.update(
				{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,
			),
		validEvent: () => ({ id: '5', sentinel: sentinelRequest() }),
	},
	{
		name: '/products/[id] action unlinkSupplier',
		label: 'product',
		uses: 'sentinel',
		run: async (id, { sentinel }) =>
			(await productDetail()).actions.unlinkSupplier(
				{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,
			),
		validEvent: () => ({ id: '5', sentinel: sentinelRequest() }),
	},
	{
		name: '/products/[id] action delete',
		label: 'product',
		uses: 'db',
		run: async (id) =>
			(await productDetail()).actions.delete({ params: { id }, locals: { restaurantId: RID } } as never),
		validEvent: () => ({ id: '5' }),
	},
	{
		name: '/suppliers/[id] load',
		label: 'supplier',
		uses: 'db',
		run: async (id) =>
			(await supplierDetail()).load(
				{ params: { id }, locals: { restaurantId: RID }, url: new URL(`http://x/suppliers/${id}`) } as never,
			),
		validEvent: () => ({ id: '5' }),
	},
	{
		name: '/suppliers/[id] action update',
		label: 'supplier',
		uses: 'sentinel',
		run: async (id, { sentinel }) =>
			(await supplierDetail()).actions.update(
				{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,
			),
		validEvent: () => ({ id: '5', sentinel: sentinelRequest() }),
	},
	{
		name: '/suppliers/[id] action addConversion',
		label: 'supplier',
		uses: 'sentinel',
		run: async (id, { sentinel }) =>
			(await supplierDetail()).actions.addConversion(
				{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,
			),
		validEvent: () => ({ id: '5', sentinel: sentinelRequest() }),
	},
	{
		name: '/suppliers/[id] action deleteConversion',
		label: 'supplier',
		uses: 'sentinel',
		run: async (id, { sentinel }) =>
			(await supplierDetail()).actions.deleteConversion(
				{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,
			),
		validEvent: () => ({ id: '5', sentinel: sentinelRequest() }),
	},
	{
		name: '/suppliers/[id] action delete',
		label: 'supplier',
		uses: 'db',
		run: async (id) =>
			(await supplierDetail()).actions.delete({ params: { id }, locals: { restaurantId: RID } } as never),
		validEvent: () => ({ id: '5' }),
	},
];

beforeEach(() => {
	dbState.calls = [];
});

describe('malformed route params — issue #542', () => {
	for (const route of ROUTES) {
		describe(route.name, () => {
			it.each(MALFORMED_IDS)('rejects id=%j with 400 and touches nothing', async (id) => {
				const sentinel = route.uses === 'sentinel' ? sentinelRequest() : undefined;

				const outcome = await route.run(id, { sentinel }).catch((e: unknown) => e);

				expect(isHttpError(outcome, 400)).toBe(true);
				expect((outcome as { body: { message: string } }).body.message).toBe(`Invalid ${route.label} id`);
				expect(dbState.calls).toEqual([]);
				if (sentinel) expect(sentinel.formData).not.toHaveBeenCalled();
			});

			it('lets a valid positive integer id past the guard', async () => {
				const { id, sentinel } = route.validEvent();

				const outcome = await route.run(id, { sentinel }).catch((e: unknown) => e);

				if (route.uses === 'sentinel') {
					expect(outcome).toBe(SENTINEL);
				} else {
					expect(dbState.calls.length).toBeGreaterThan(0);
					const isOurGuard =
						isHttpError(outcome, 400) &&
						(outcome as { body: { message: string } }).body.message === `Invalid ${route.label} id`;
					expect(isOurGuard).toBe(false);
				}
			});
		});
	}
});

describe('/batch/[id] — malformed id stays a redirect, never a raw db error (issue #542)', () => {
	const GUARD_LOCATION = '/?error=Session+not+found';

	it.each(['not-a-uuid', "1' OR '1'='1", 'abc', '../etc/passwd'])(
		'redirects instead of 500ing for batchId=%j',
		async (id) => {
			const { load } = await import('../src/routes/(app)/batch/[id]/+page.server');

			const outcome = await Promise.resolve(load({ params: { id }, locals: { restaurantId: RID } } as never)).catch(
				(e: unknown) => e,
			);

			expect(isRedirect(outcome)).toBe(true);
			expect((outcome as { location: string }).location).toBe(GUARD_LOCATION);
		},
	);

	it('redirects the same way for a well-formed but unknown UUID', async () => {
		const { load } = await import('../src/routes/(app)/batch/[id]/+page.server');

		const outcome = await Promise.resolve(
			load({ params: { id: '99999999-9999-9999-9999-999999999999' }, locals: { restaurantId: RID } } as never),
		).catch((e: unknown) => e);

		expect(isRedirect(outcome)).toBe(true);
		expect((outcome as { location: string }).location).toBe(GUARD_LOCATION);
	});
});
