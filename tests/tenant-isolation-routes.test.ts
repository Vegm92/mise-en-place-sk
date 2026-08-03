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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

const { state, getBatchItemsMock } = vi.hoisted(() => ({
	state: {
		/** rid passed to forTenant(), or null when the route never scoped */
		scopedTo: null as string | null,
		/** true when the query chain applied a .where() */
		whereApplied: false,
		supplierRows: [] as Array<Record<string, unknown>>,
	},
	getBatchItemsMock: vi.fn(),
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
	addItems: vi.fn(),
	removeItem: vi.fn(),
	deleteBatch: vi.fn(),
	isBatchSettled: vi.fn(),
	markQueued: vi.fn(),
	markDiscarded: vi.fn(),
	pickActiveItem: (items: unknown[]) => items[0] ?? null,
}));

// Pulled in by the batch route's action paths, irrelevant to load().
vi.mock('$lib/server/sessions', () => ({
	localFilePath: vi.fn(), saveUploadedFiles: vi.fn(), deleteUploadFile: vi.fn(),
}));
vi.mock('$lib/server/queue', () => ({ enqueueExtraction: vi.fn() }));
vi.mock('$lib/server/extract-batch', () => ({ enqueueBatchExtraction: vi.fn() }));
vi.mock('$lib/server/batch-core', () => ({ createBatchStore: vi.fn() }));
vi.mock('$lib/server/invoice-save', () => ({ saveReviewedInvoice: vi.fn() }));
vi.mock('$lib/server/events', () => ({ trackEvent: vi.fn() }));
vi.mock('$lib/server/storage', () => ({ getStorage: vi.fn() }));

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

beforeEach(() => {
	state.scopedTo = null;
	state.whereApplied = false;
	state.supplierRows = [];
	getBatchItemsMock.mockReset();
});

describe('/invoices/export — supplier list must be tenant-scoped', () => {
	it('scopes the supplier query to the caller\'s restaurant', async () => {
		const { load } = await import('../src/routes/(app)/invoices/export/+page.server');
		state.supplierRows = [{ id: 1, name: 'Proveedor A' }];

		const result = await load({ locals: { restaurantId: RID_A } } as never);

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

		const result = await load({
			params: { id: 'batch-1' },
			locals: { restaurantId: RID_A },
		} as never);

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

		const outcome = await load({
			params: { id: 'batch-1' },
			locals: { restaurantId: RID_A },
		} as never).catch((e: unknown) => e);

		expect(JSON.stringify(outcome)).not.toContain('Proveedor Secreto');
	});
});
