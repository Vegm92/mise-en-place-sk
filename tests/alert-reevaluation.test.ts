/**
 * Issue #831: alerts were computed once at save time (ADR-010) and never
 * touched again — correcting the data that raised them (a mis-OCR'd price,
 * a wrong total, a supplier's category) left the alert `pending` forever,
 * and deleting the invoice that raised it left the alert pointing at
 * nothing.
 *
 * This exercises the fix end-to-end: editing an invoice re-runs the
 * re-evaluable rules (price_shock, budget_overage, possible_duplicate_purchase,
 * verifactu_qr_mismatch) and closes any of them whose condition no longer
 * holds by marking the row `resolved` (a status distinct from the user's own
 * `sent` dismissal); deleting an invoice orphans the alerts that were about
 * that invoice specifically; correcting a supplier's category by hand closes
 * the categorisation nudge/suggestion the same way accepting it from the
 * bell would.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped
 * without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('../src/lib/server/db', async () => {
	const helpers = await import('./helpers/test-db');
	const tenant = await import('../src/lib/server/tenant');
	return { db: helpers.testDb, forTenant: tenant.forTenant };
});

import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { saveReviewedInvoice, type SaveOutcome } from '../src/lib/server/invoice-save';
import { categoryBudgets, suppliers } from '../src/lib/server/schema';
import { eq } from 'drizzle-orm';
import { toMonthStr } from '../src/lib/formatters';
import type { BatchItem } from '../src/lib/server/batch';
import { fakeBatchItem } from './helpers/batch-item';

function assertSaved(outcome: SaveOutcome): asserts outcome is Extract<SaveOutcome, { type: 'saved' }> {
	expect(outcome.type).toBe('saved');
	if (outcome.type !== 'saved') throw new Error(`expected a saved outcome, got ${outcome.type}`);
}

let rid = '';
const USER_ID = 'user-831';

beforeAll(async () => { if (hasDbEnv) rid = (await createTestRestaurant('alert-reeval-831')).id; });
afterAll(async () => { if (hasDbEnv) { await cleanupTestRestaurant(rid); await closeDb(); } });

function fakeItem(extractedData: Record<string, unknown> | null = { confidence: 1 }): BatchItem {
	return fakeBatchItem({ restaurantId: rid, extractedData });
}

function buildFormData(fields: Record<string, string | undefined>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(fields)) if (value !== undefined) fd.append(key, value);
	return fd;
}

function invoiceFields(opts: {
	supplier: string; invoiceNumber: string; invoiceDate: string; totalAmount: string;
	description?: string; unitPrice?: string;
}) {
	const header: [string, string][] = [
		['supplier_name', opts.supplier], ['invoice_number', opts.invoiceNumber],
		['invoice_date', opts.invoiceDate], ['total_amount', opts.totalAmount],
	];
	const oneLine: [string, string][] = [
		['line_descriptions', opts.description ?? 'Producto de prueba'], ['line_quantities', '1'], ['line_units', 'ud'],
		['line_unit_prices', opts.unitPrice ?? opts.totalAmount], ['line_total_prices', opts.totalAmount], ['line_tax_rates', ''],
	];
	return Object.fromEntries([...header, ...oneLine]);
}

function saveForm(opts: Parameters<typeof invoiceFields>[0] & { documentType?: 'factura' | 'albaran' }): FormData {
	return buildFormData({ ...invoiceFields(opts), low_confidence_ack: 'true', document_type: opts.documentType });
}

function editForm(opts: Parameters<typeof invoiceFields>[0] & { version: number }): FormData {
	return buildFormData({ ...invoiceFields(opts), version: String(opts.version) });
}

async function runAction<T>(
	modulePath: Promise<{ actions: Record<string, unknown> }>,
	actionName: string,
	event: Record<string, unknown>,
): Promise<T> {
	const { actions } = await modulePath;
	return (actions[actionName] as (e: never) => Promise<T>)(event as never).catch((e: unknown) => e as T);
}

const runEdit = (invoiceId: number, formData: FormData) => runAction(
	import('../src/routes/(app)/invoice/[id]/edit/+page.server'), 'save',
	{ params: { id: String(invoiceId) }, locals: { restaurantId: rid, user: { id: USER_ID } }, request: { formData: async () => formData } },
);

const runDelete = (invoiceId: number) => runAction(
	import('../src/routes/(app)/invoice/[id]/+page.server'), 'delete',
	{ params: { id: String(invoiceId) }, locals: { restaurantId: rid, user: { id: USER_ID } } },
);

const runSupplierUpdate = (supplierId: number, formData: FormData) => runAction(
	import('../src/routes/(app)/suppliers/[id]/+page.server'), 'update',
	{ params: { id: String(supplierId) }, locals: { restaurantId: rid }, request: { formData: async () => formData } },
);

async function invoiceVersion(invoiceId: number): Promise<number> {
	const [row] = await testSql`SELECT version FROM invoices WHERE id = ${invoiceId}`;
	return row.version as number;
}

async function notifications(invoiceId: number, notificationType: string) {
	return testSql`
		SELECT id, status, payload FROM system_notifications
		WHERE restaurant_id = ${rid} AND invoice_id = ${invoiceId} AND notification_type = ${notificationType}
		ORDER BY id`;
}

async function expectNotificationStatus(invoiceId: number, notificationType: string, status: string) {
	const rows = await notifications(invoiceId, notificationType);
	expect(rows).toHaveLength(1);
	expect(rows[0].status).toBe(status);
	return rows[0];
}

async function runAndExpectResolved(actionPromise: Promise<unknown>, invoiceId: number, notificationType: string) {
	expect(isRedirect(await actionPromise)).toBe(true);
	await expectNotificationStatus(invoiceId, notificationType, 'resolved');
}

async function supplierIdByName(name: string): Promise<number> {
	const [row] = await testSql`SELECT id FROM suppliers WHERE restaurant_id = ${rid} AND name = ${name}`;
	return row.id as number;
}

/** Saves a baseline (unitPrice 1.00) then a shocking follow-up (unitPrice 2.00) for the same product; returns the shocking invoice's id. */
async function savePriceShockPair(supplier: string, description: string, tag: string): Promise<number> {
	await saveReviewedInvoice(
		fakeItem(),
		saveForm({ supplier, invoiceNumber: `${tag}-001`, invoiceDate: '2024-01-01', totalAmount: '10.00', description, unitPrice: '1.00' }),
		rid,
	);
	const shocked = await saveReviewedInvoice(
		fakeItem(),
		saveForm({ supplier, invoiceNumber: `${tag}-002`, invoiceDate: '2024-01-08', totalAmount: '20.00', description, unitPrice: '2.00' }),
		rid,
	);
	assertSaved(shocked);
	return shocked.invoiceId;
}

/** Sets up a category budget of 100.00 and saves an invoice that puts the category's month-to-date spend at 90% (warning level). */
async function setupBudgetWarning(supplier: string, category: string, invoiceNumberPrefix: string, todayIso: string): Promise<number> {
	const baseline = await saveReviewedInvoice(
		fakeItem(),
		saveForm({ supplier, invoiceNumber: `${invoiceNumberPrefix}-001`, invoiceDate: todayIso, totalAmount: '5.00' }),
		rid,
	);
	assertSaved(baseline);

	const supplierId = await supplierIdByName(supplier);
	await testDb.update(suppliers).set({ category }).where(eq(suppliers.id, supplierId));
	await testDb.insert(categoryBudgets).values({ restaurantId: rid, category, month: toMonthStr(new Date()), monthlyBudget: '100.00' });

	const overBudget = await saveReviewedInvoice(
		fakeItem(),
		saveForm({ supplier, invoiceNumber: `${invoiceNumberPrefix}-002`, invoiceDate: todayIso, totalAmount: '90.00' }),
		rid,
	);
	assertSaved(overBudget);
	return overBudget.invoiceId;
}

describe.skipIf(!hasDbEnv)('alert re-evaluation on correction (issue #831)', () => {
	it('resolves price_shock once the corrected price no longer deviates', async () => {
		const supplier = '__reeval_price_a__';
		const invoiceId = await savePriceShockPair(supplier, 'Aceite girasol', 'PS-A');
		await expectNotificationStatus(invoiceId, 'price_shock', 'pending');

		const version = await invoiceVersion(invoiceId);
		await runAndExpectResolved(runEdit(invoiceId, editForm({
			supplier, invoiceNumber: 'PS-A-002', invoiceDate: '2024-01-08', totalAmount: '10.50', version,
			description: 'Aceite girasol', unitPrice: '1.05',
		})), invoiceId, 'price_shock');
	});

	it('leaves price_shock pending when the correction still deviates', async () => {
		const supplier = '__reeval_price_b__';
		const invoiceId = await savePriceShockPair(supplier, 'Harina 00', 'PS-B');

		const version = await invoiceVersion(invoiceId);
		await runEdit(invoiceId, editForm({
			supplier, invoiceNumber: 'PS-B-002', invoiceDate: '2024-01-08', totalAmount: '19.00', version,
			description: 'Harina 00', unitPrice: '1.90',
		}));

		await expectNotificationStatus(invoiceId, 'price_shock', 'pending');
	});

	it('resolves budget_overage once the corrected total drops spend below the threshold', async () => {
		const supplier = '__reeval_budget__';
		const todayIso = new Date().toISOString().slice(0, 10);
		const invoiceId = await setupBudgetWarning(supplier, 'Bebidas', 'BO', todayIso);

		const before = await expectNotificationStatus(invoiceId, 'budget_overage', 'pending');
		expect(before.payload.level).toBe('warning');

		const version = await invoiceVersion(invoiceId);
		await runAndExpectResolved(
			runEdit(invoiceId, editForm({ supplier, invoiceNumber: 'BO-002', invoiceDate: todayIso, totalAmount: '5.00', version })),
			invoiceId, 'budget_overage',
		);
	});

	it('resolves possible_duplicate_purchase once the corrected total no longer matches', async () => {
		const supplier = '__reeval_dupe__';

		const albaran = await saveReviewedInvoice(
			fakeItem({ document_type: 'albaran', confidence: 1 }),
			saveForm({
				supplier, invoiceNumber: 'DUP-ALB-001', invoiceDate: '2024-02-01', totalAmount: '100.00',
				description: 'Tomates frescos', documentType: 'albaran',
			}),
			rid,
		);
		assertSaved(albaran);

		const factura = await saveReviewedInvoice(
			fakeItem({ document_type: 'factura', confidence: 1 }),
			saveForm({
				supplier, invoiceNumber: 'DUP-FAC-001', invoiceDate: '2024-02-03', totalAmount: '105.00',
				description: 'Reparto urgente', documentType: 'factura',
			}),
			rid,
		);
		assertSaved(factura);

		await expectNotificationStatus(factura.invoiceId, 'possible_duplicate_purchase', 'pending');

		const version = await invoiceVersion(factura.invoiceId);
		await runAndExpectResolved(runEdit(factura.invoiceId, editForm({
			supplier, invoiceNumber: 'DUP-FAC-001', invoiceDate: '2024-02-03', totalAmount: '500.00', version,
			description: 'Reparto urgente',
		})), factura.invoiceId, 'possible_duplicate_purchase');
	});

	it('resolves verifactu_qr_mismatch once the corrected fields match the QR', async () => {
		const supplier = '__reeval_qr__';
		const qrUrl = 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=QR-2024-001&fecha=15-01-2024&importe=1250.00';

		const mismatched = await saveReviewedInvoice(
			fakeItem({ qr_url: qrUrl, confidence: 1 }),
			saveForm({ supplier, invoiceNumber: 'QR-2024-001', invoiceDate: '2024-01-15', totalAmount: '9999.00' }),
			rid,
		);
		assertSaved(mismatched);

		await expectNotificationStatus(mismatched.invoiceId, 'verifactu_qr_mismatch', 'pending');

		const version = await invoiceVersion(mismatched.invoiceId);
		await runAndExpectResolved(runEdit(mismatched.invoiceId, editForm({
			supplier, invoiceNumber: 'QR-2024-001', invoiceDate: '2024-01-15', totalAmount: '1250.00', version,
		})), mismatched.invoiceId, 'verifactu_qr_mismatch');

		const [invoiceRow] = await testSql`SELECT qr_mismatch FROM invoices WHERE id = ${mismatched.invoiceId}`;
		expect(invoiceRow.qr_mismatch).toBe(false);
	});

	it('orphans invoice-bound alerts (price_shock) when the invoice is deleted', async () => {
		const supplier = '__reeval_delete__';
		const invoiceId = await savePriceShockPair(supplier, 'Queso curado', 'DEL');
		await expectNotificationStatus(invoiceId, 'price_shock', 'pending');
		await runAndExpectResolved(runDelete(invoiceId), invoiceId, 'price_shock');
	});

	it('re-evaluates budget_overage against remaining spend when the triggering invoice is deleted', async () => {
		const supplier = '__reeval_delete_budget__';
		const todayIso = new Date().toISOString().slice(0, 10);
		const invoiceId = await setupBudgetWarning(supplier, 'Limpieza', 'DELB', todayIso);
		await expectNotificationStatus(invoiceId, 'budget_overage', 'pending');
		await runAndExpectResolved(runDelete(invoiceId), invoiceId, 'budget_overage');
	});

	it('resolves supplier_uncategorized once the category is corrected directly on the supplier profile', async () => {
		const supplier = '__reeval_supplier_cat__';

		const created = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'SUP-001', invoiceDate: '2024-04-01', totalAmount: '10.00' }),
			rid,
		);
		assertSaved(created);

		await expectNotificationStatus(created.invoiceId, 'supplier_uncategorized', 'pending');

		const supplierId = await supplierIdByName(supplier);
		await runAndExpectResolved(
			runSupplierUpdate(supplierId, buildFormData({ name: supplier, category: 'Bebidas' })),
			created.invoiceId, 'supplier_uncategorized',
		);
	});
});
