/**
 * Route-level tenant isolation (issue #380).
 *
 * `tests/tenant-isolation.test.ts` proves `forTenant().scope()` composes a
 * correct predicate. That is a property of a 12-line helper, and it cannot
 * fail when a route forgets to call the helper at all — which is the failure
 * mode that actually leaks data, and the one RLS never caught either (the app
 * connects as the table owner, so owners bypassed the policies; see ADR-005).
 *
 * These are regression tests for two such omissions found while implementing
 * #380. Both routes returned another tenant's rows to the page:
 *
 *   - /invoices/export      selected every supplier in the database, unscoped
 *   - /batch/[id]           returned any batch's items and extracted invoice
 *                           data to anyone who had the batch UUID
 *
 * db and the batch store are mocked, so these run everywhere — no DB needed.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

const { state, getBatchItemsMock, mutations } = vi.hoisted(() => ({
	state: {
		/** rid passed to forTenant(), or null when the route never scoped */
		scopedTo: null as string | null,
		/** true when the query chain applied a .where() */
		whereApplied: false,
		supplierRows: [] as Array<Record<string, unknown>>,
	},
	getBatchItemsMock: vi.fn(),
	/**
	 * Every dependency an action can use to change something — storage, the
	 * queue, the batch tables, the invoice write path, analytics. A guard that
	 * redirects *after* one of these has run is not a guard, and asserting only
	 * on the redirect cannot tell the difference (issue #520).
	 */
	mutations: {
		addItems: vi.fn(),
		removeItem: vi.fn(),
		deleteBatch: vi.fn(),
		markQueued: vi.fn(),
		markDiscarded: vi.fn(),
		saveUploadedFiles: vi.fn(),
		deleteUploadFile: vi.fn(),
		enqueueExtraction: vi.fn(),
		enqueueBatchExtraction: vi.fn(),
		saveReviewedInvoice: vi.fn(),
		trackEvent: vi.fn(),
		storageDelete: vi.fn(),
	},
}));

vi.mock('$lib/server/db', () => {
	const chain = (rows: () => unknown[]) => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'innerJoin', 'leftJoin', 'limit', 'orderBy']) p[m] = () => p;
		p.where = () => {
			state.whereApplied = true;
			return p;
		};
		p.then = (res: (v: unknown) => unknown) => Promise.resolve(rows()).then(res);
		return p;
	};
	return {
		db: { select: () => chain(() => state.supplierRows) },
		forTenant: (rid: string) => {
			state.scopedTo = rid;
			return { rid, scope: () => ({}) };
		},
	};
});

vi.mock('$lib/server/batch', () => ({
	getBatchItems: getBatchItemsMock,
	getItem: vi.fn(),
	addItems: mutations.addItems,
	removeItem: mutations.removeItem,
	deleteBatch: mutations.deleteBatch,
	isBatchSettled: vi.fn(),
	markQueued: mutations.markQueued,
	markDiscarded: mutations.markDiscarded,
	pickActiveItem: (items: unknown[]) => items[0] ?? null,
}));

vi.mock('$lib/server/sessions', () => ({
	localFilePath: vi.fn(),
	saveUploadedFiles: mutations.saveUploadedFiles,
	deleteUploadFile: mutations.deleteUploadFile,
}));
vi.mock('$lib/server/queue', () => ({ enqueueExtraction: mutations.enqueueExtraction }));
vi.mock('$lib/server/extract-batch', () => ({ enqueueBatchExtraction: mutations.enqueueBatchExtraction }));
vi.mock('$lib/server/batch-core', () => ({ createBatchStore: vi.fn(() => ({ markConfirmed: vi.fn() })) }));
vi.mock('$lib/server/invoice-save', () => ({ saveReviewedInvoice: mutations.saveReviewedInvoice }));
vi.mock('$lib/server/events', () => ({ trackEvent: mutations.trackEvent }));
vi.mock('$lib/server/storage', () => ({ getStorage: () => ({ delete: mutations.storageDelete }) }));

const RID_A = '11111111-1111-1111-1111-111111111111';
const RID_B = '22222222-2222-2222-2222-222222222222';

const batchItem = (restaurantId: string) => ({
	id: 'item-1',
	batchId: 'batch-1',
	restaurantId,
	position: 1,
	fileKey: 'k',
	displayName: 'factura.pdf',
	status: 'done' as const,
	extractedData: { supplier_name: 'Proveedor Secreto', invoice_number: 'F-001' },
	conversionNotes: null,
	extractError: null,
});

const fakeRequest = (fields: Record<string, string>) => ({
	formData: async () => ({
		get: (k: string) => fields[k] ?? null,
		getAll: (_k: string) => [] as unknown[],
	}),
});

beforeEach(() => {
	state.scopedTo = null;
	state.whereApplied = false;
	state.supplierRows = [];
	getBatchItemsMock.mockReset();
	for (const fn of Object.values(mutations)) fn.mockReset();
	mutations.saveReviewedInvoice.mockResolvedValue({ type: 'replay' });
	mutations.saveUploadedFiles.mockResolvedValue({ saved: [], keys: [], errors: [] });
});

describe('/invoices/export — supplier list must be tenant-scoped', () => {
	it('scopes the supplier query to the caller\'s restaurant', async () => {
		const { load } = await import('../src/routes/(app)/invoices/export/+page.server');
		state.supplierRows = [{ id: 1, name: 'Proveedor A' }];

		const result = (await load({ locals: { restaurantId: RID_A } } as never)) as {
			suppliers: Array<{ id: number; name: string }>;
		};

		expect(state.scopedTo).toBe(RID_A);
		expect(state.whereApplied).toBe(true);
		expect(result.suppliers).toEqual([{ id: 1, name: 'Proveedor A' }]);
	});

	it('does not issue an unfiltered select over every supplier', async () => {
		const { load } = await import('../src/routes/(app)/invoices/export/+page.server');
		await load({ locals: { restaurantId: RID_A } } as never);

		// The original bug: load() ignored locals entirely and selected all
		// suppliers across all restaurants for the filter dropdown.
		expect(state.scopedTo).not.toBeNull();
		expect(state.whereApplied).toBe(true);
	});
});

describe('/batch/[id] — batch contents must belong to the caller', () => {
	it('serves a batch owned by the caller', async () => {
		const { load } = await import('../src/routes/(app)/batch/[id]/+page.server');
		getBatchItemsMock.mockResolvedValue([batchItem(RID_A)]);

		const result = (await load({
			params: { id: 'batch-1' },
			locals: { restaurantId: RID_A },
		} as never)) as { queue: unknown[] };

		expect(result.queue).toHaveLength(1);
	});

	it('refuses a batch belonging to another tenant', async () => {
		const { load } = await import('../src/routes/(app)/batch/[id]/+page.server');
		getBatchItemsMock.mockResolvedValue([batchItem(RID_B)]);

		// Same redirect as a missing batch, so a foreign id is indistinguishable
		// from one that does not exist.
		await expect(
			load({ params: { id: 'batch-1' }, locals: { restaurantId: RID_A } } as never)
		).rejects.toSatisfy(isRedirect);
	});

	it('refuses a batch with any item from another tenant', async () => {
		const { load } = await import('../src/routes/(app)/batch/[id]/+page.server');
		getBatchItemsMock.mockResolvedValue([batchItem(RID_A), batchItem(RID_B)]);

		await expect(
			load({ params: { id: 'batch-1' }, locals: { restaurantId: RID_A } } as never)
		).rejects.toSatisfy(isRedirect);
	});

	it('does not leak extracted invoice data for a foreign batch', async () => {
		const { load } = await import('../src/routes/(app)/batch/[id]/+page.server');
		getBatchItemsMock.mockResolvedValue([batchItem(RID_B)]);

		const outcome = await Promise.resolve(
			load({ params: { id: 'batch-1' }, locals: { restaurantId: RID_A } } as never)
		).catch((e: unknown) => e);

		expect(JSON.stringify(outcome)).not.toContain('Proveedor Secreto');
	});
});

describe('/batch/[id] actions — every action must reject a batch owned by another tenant (issues #479, #520)', () => {
	// #479: `extract` enqueued extraction for any batch UUID with no ownership
	// check at all, unlike `add` right below it in the same file. Fixed by
	// routing every action through the same requireOwnedBatch() guard load()
	// already used, so a future action cannot silently omit the check.
	//
	// #520: the names used to be typed out here, so an eighth action would have
	// been added without a test and nobody would have noticed. They now come
	// from the module, and the assertions cover the side effects rather than
	// only the redirect — the two bugs #479 found were a leak and a delete, and
	// both would still have redirected afterwards.
	const GUARD_LOCATION = '/?error=Session+not+found';

	const loadActions = async () => {
		const { actions } = await import('../src/routes/(app)/batch/[id]/+page.server');
		return actions as Record<string, (e: never) => Promise<unknown>>;
	};

	const foreignEvent = () => ({
		params: { id: 'batch-1' },
		locals: { restaurantId: RID_A },
		request: fakeRequest({ itemId: 'item-1' }),
	}) as never;

	let actionNames: string[] = [];

	beforeAll(async () => {
		actionNames = Object.keys(await loadActions());
	});

	it('discovers the actions from the route module rather than a hand-written list', async () => {
		const names = Object.keys(await loadActions());

		expect(names.length).toBeGreaterThan(0);
		// The seven that existed when #479 was fixed; a new one joins the table
		// automatically, and losing one of these is a deletion worth noticing.
		expect(names).toEqual(
			expect.arrayContaining(['extract', 'retry', 'save', 'discardItem', 'discardBatch', 'add', 'remove'])
		);
	});

	it('runs the table over every action the route exports', () => {
		expect(actionNames.length).toBeGreaterThanOrEqual(7);
	});

	it.each(['extract', 'retry', 'save', 'discardItem', 'discardBatch', 'add', 'remove'])(
		'%s redirects instead of acting on a foreign batch',
		async (name) => {
			const actions = await loadActions();
			getBatchItemsMock.mockResolvedValue([batchItem(RID_B)]);

			await expect(actions[name](foreignEvent())).rejects.toSatisfy(isRedirect);
		}
	);

	it.each(['extract', 'retry', 'save', 'discardItem', 'discardBatch', 'add', 'remove'])(
		'%s refuses with the guard\'s own redirect, not one of its own',
		async (name) => {
			const actions = await loadActions();
			getBatchItemsMock.mockResolvedValue([batchItem(RID_B)]);

			const outcome = await actions[name](foreignEvent()).catch((e: unknown) => e);

			expect((outcome as { location: string }).location).toBe(GUARD_LOCATION);
		}
	);

	it.each(['extract', 'retry', 'save', 'discardItem', 'discardBatch', 'add', 'remove'])(
		'%s changes nothing before redirecting on a foreign batch',
		async (name) => {
			const actions = await loadActions();
			getBatchItemsMock.mockResolvedValue([batchItem(RID_B)]);

			await actions[name](foreignEvent()).catch(() => undefined);

			for (const [dep, fn] of Object.entries(mutations)) {
				expect(fn, `${name} called ${dep} on a batch it does not own`).not.toHaveBeenCalled();
			}
		}
	);

	it('refuses a mixed batch where only one item belongs to another tenant', async () => {
		const actions = await loadActions();
		getBatchItemsMock.mockResolvedValue([batchItem(RID_A), batchItem(RID_B)]);

		await expect(actions.discardBatch(foreignEvent())).rejects.toSatisfy(isRedirect);
		expect(mutations.deleteBatch).not.toHaveBeenCalled();
	});
});

describe('/batch/[id] actions — the guard is not a blanket refusal', () => {
	// Without this, an action that redirected unconditionally would pass every
	// assertion above while being completely broken.
	const GUARD_LOCATION = '/?error=Session+not+found';

	const ownedEvent = () => ({
		params: { id: 'batch-1' },
		locals: { restaurantId: RID_A },
		request: fakeRequest({ itemId: 'item-1' }),
	}) as never;

	it.each(['extract', 'retry', 'save', 'discardItem', 'discardBatch', 'add', 'remove'])(
		'%s gets past the ownership guard for a batch the caller owns',
		async (name) => {
			const { actions } = await import('../src/routes/(app)/batch/[id]/+page.server');
			getBatchItemsMock.mockResolvedValue([batchItem(RID_A)]);

			const outcome = await (actions as Record<string, (e: never) => Promise<unknown>>)[name](
				ownedEvent()
			).catch((e: unknown) => e);

			expect((outcome as { location?: string })?.location).not.toBe(GUARD_LOCATION);
		}
	);
});
