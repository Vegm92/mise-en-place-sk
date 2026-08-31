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
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';
import { categoryBudgets, suppliers } from '../src/lib/server/schema';
import { eq } from 'drizzle-orm';
import { toMonthStr } from '../src/lib/formatters';
import type { BatchItem } from '../src/lib/server/batch';

let rid = '';
const USER_ID = 'user-831';

function fakeItem(extractedData: Record<string, unknown> | null = { confidence: 1 }): BatchItem {
	return {
		id: 'item-1', batchId: 'batch-1', restaurantId: rid, position: 0,
		fileKey: 'fake.pdf', displayName: 'fake.pdf', status: 'done',
		extractedData, conversionNotes: null, extractError: null, queuedAt: null,
		source: 'web', sourceRef: null, jobCode: null, reviewStatus: null,
	};
}

function saveForm(opts: {
	supplier: string; invoiceNumber: string; invoiceDate: string; totalAmount: string;
	description?: string; unitPrice?: string; documentType?: 'factura' | 'albaran';
}): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier);
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', opts.invoiceDate);
	fd.append('total_amount', opts.totalAmount);
	fd.append('low_confidence_ack', 'true');
	if (opts.documentType) fd.append('document_type', opts.documentType);
	fd.append('line_descriptions', opts.description ?? 'Producto de prueba');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'ud');
	fd.append('line_unit_prices', opts.unitPrice ?? opts.totalAmount);
	fd.append('line_total_prices', opts.totalAmount);
	fd.append('line_tax_rates', '');
	return fd;
}

function editForm(opts: {
	supplier: string; invoiceNumber: string; invoiceDate: string; totalAmount: string; version: number;
	description?: string; unitPrice?: string;
}): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier);
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', opts.invoiceDate);
	fd.append('total_amount', opts.totalAmount);
	fd.append('version', String(opts.version));
	fd.append('line_descriptions', opts.description ?? 'Producto de prueba');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'ud');
	fd.append('line_unit_prices', opts.unitPrice ?? opts.totalAmount);
	fd.append('line_total_prices', opts.totalAmount);
	fd.append('line_tax_rates', '');
	return fd;
}

async function runEdit(invoiceId: number, formData: FormData) {
	const { actions } = await import('../src/routes/(app)/invoice/[id]/edit/+page.server');
	const event = {
		params: { id: String(invoiceId) },
		locals: { restaurantId: rid, user: { id: USER_ID } },
		request: { formData: async () => formData },
	} as never;
	return (actions.save as (e: never) => Promise<unknown>)(event).catch((e: unknown) => e);
}

async function runDelete(invoiceId: number) {
	const { actions } = await import('../src/routes/(app)/invoice/[id]/+page.server');
	const event = {
		params: { id: String(invoiceId) },
		locals: { restaurantId: rid, user: { id: USER_ID } },
	} as never;
	return (actions.delete as (e: never) => Promise<unknown>)(event).catch((e: unknown) => e);
}

async function runSupplierUpdate(supplierId: number, formData: FormData) {
	const { actions } = await import('../src/routes/(app)/suppliers/[id]/+page.server');
	const event = {
		params: { id: String(supplierId) },
		locals: { restaurantId: rid },
		request: { formData: async () => formData },
	} as never;
	return (actions.update as (e: never) => Promise<unknown>)(event).catch((e: unknown) => e);
}

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

async function supplierIdByName(name: string): Promise<number> {
	const [row] = await testSql`SELECT id FROM suppliers WHERE restaurant_id = ${rid} AND name = ${name}`;
	return row.id as number;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('alert-reeval-831');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('alert re-evaluation on correction (issue #831)', () => {
	it('resolves price_shock once the corrected price no longer deviates', async () => {
		const supplier = '__reeval_price_a__';

		const baseline = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'PS-A-001', invoiceDate: '2024-01-01', totalAmount: '10.00', description: 'Aceite girasol', unitPrice: '1.00' }),
			rid,
		);
		expect(baseline.type).toBe('saved');

		const shocked = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'PS-A-002', invoiceDate: '2024-01-08', totalAmount: '20.00', description: 'Aceite girasol', unitPrice: '2.00' }),
			rid,
		);
		expect(shocked.type).toBe('saved');
		if (shocked.type !== 'saved') return;

		expect(await notifications(shocked.invoiceId, 'price_shock')).toHaveLength(1);

		const version = await invoiceVersion(shocked.invoiceId);
		const result = await runEdit(shocked.invoiceId, editForm({
			supplier, invoiceNumber: 'PS-A-002', invoiceDate: '2024-01-08', totalAmount: '10.50', version,
			description: 'Aceite girasol', unitPrice: '1.05',
		}));
		expect(isRedirect(result)).toBe(true);

		const rows = await notifications(shocked.invoiceId, 'price_shock');
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('resolved');
	});

	it('leaves price_shock pending when the correction still deviates', async () => {
		const supplier = '__reeval_price_b__';

		await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'PS-B-001', invoiceDate: '2024-01-01', totalAmount: '10.00', description: 'Harina 00', unitPrice: '1.00' }),
			rid,
		);

		const shocked = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'PS-B-002', invoiceDate: '2024-01-08', totalAmount: '20.00', description: 'Harina 00', unitPrice: '2.00' }),
			rid,
		);
		expect(shocked.type).toBe('saved');
		if (shocked.type !== 'saved') return;

		const version = await invoiceVersion(shocked.invoiceId);
		await runEdit(shocked.invoiceId, editForm({
			supplier, invoiceNumber: 'PS-B-002', invoiceDate: '2024-01-08', totalAmount: '19.00', version,
			description: 'Harina 00', unitPrice: '1.90',
		}));

		const rows = await notifications(shocked.invoiceId, 'price_shock');
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('pending');
	});

	it('resolves budget_overage once the corrected total drops spend below the threshold', async () => {
		const supplier = '__reeval_budget__';
		const category = 'Bebidas';
		const month = toMonthStr(new Date());
		const todayIso = new Date().toISOString().slice(0, 10);

		const created = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'BO-001', invoiceDate: todayIso, totalAmount: '5.00' }),
			rid,
		);
		expect(created.type).toBe('saved');
		if (created.type !== 'saved') return;

		const supplierId = await supplierIdByName(supplier);
		await testDb.update(suppliers).set({ category }).where(eq(suppliers.id, supplierId));
		await testDb.insert(categoryBudgets).values({ restaurantId: rid, category, month, monthlyBudget: '100.00' });

		const overBudget = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'BO-002', invoiceDate: todayIso, totalAmount: '90.00' }),
			rid,
		);
		expect(overBudget.type).toBe('saved');
		if (overBudget.type !== 'saved') return;

		const before = await notifications(overBudget.invoiceId, 'budget_overage');
		expect(before).toHaveLength(1);
		expect(before[0].payload.level).toBe('warning');

		const version = await invoiceVersion(overBudget.invoiceId);
		await runEdit(overBudget.invoiceId, editForm({
			supplier, invoiceNumber: 'BO-002', invoiceDate: todayIso, totalAmount: '5.00', version,
		}));

		const after = await notifications(overBudget.invoiceId, 'budget_overage');
		expect(after).toHaveLength(1);
		expect(after[0].status).toBe('resolved');
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
		expect(albaran.type).toBe('saved');

		const factura = await saveReviewedInvoice(
			fakeItem({ document_type: 'factura', confidence: 1 }),
			saveForm({
				supplier, invoiceNumber: 'DUP-FAC-001', invoiceDate: '2024-02-03', totalAmount: '105.00',
				description: 'Servicio de transporte', documentType: 'factura',
			}),
			rid,
		);
		expect(factura.type).toBe('saved');
		if (factura.type !== 'saved') return;

		expect(await notifications(factura.invoiceId, 'possible_duplicate_purchase')).toHaveLength(1);

		const version = await invoiceVersion(factura.invoiceId);
		await runEdit(factura.invoiceId, editForm({
			supplier, invoiceNumber: 'DUP-FAC-001', invoiceDate: '2024-02-03', totalAmount: '500.00', version,
			description: 'Servicio de transporte',
		}));

		const rows = await notifications(factura.invoiceId, 'possible_duplicate_purchase');
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('resolved');
	});

	it('resolves verifactu_qr_mismatch once the corrected fields match the QR', async () => {
		const supplier = '__reeval_qr__';
		const qrUrl = 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=QR-2024-001&fecha=15-01-2024&importe=1250.00';

		const mismatched = await saveReviewedInvoice(
			fakeItem({ qr_url: qrUrl, confidence: 1 }),
			saveForm({ supplier, invoiceNumber: 'QR-2024-001', invoiceDate: '2024-01-15', totalAmount: '9999.00' }),
			rid,
		);
		expect(mismatched.type).toBe('saved');
		if (mismatched.type !== 'saved') return;

		expect(await notifications(mismatched.invoiceId, 'verifactu_qr_mismatch')).toHaveLength(1);

		const version = await invoiceVersion(mismatched.invoiceId);
		await runEdit(mismatched.invoiceId, editForm({
			supplier, invoiceNumber: 'QR-2024-001', invoiceDate: '2024-01-15', totalAmount: '1250.00', version,
		}));

		const rows = await notifications(mismatched.invoiceId, 'verifactu_qr_mismatch');
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('resolved');

		const [invoiceRow] = await testSql`SELECT qr_mismatch FROM invoices WHERE id = ${mismatched.invoiceId}`;
		expect(invoiceRow.qr_mismatch).toBe(false);
	});

	it('orphans invoice-bound alerts (price_shock) when the invoice is deleted', async () => {
		const supplier = '__reeval_delete__';

		await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'DEL-001', invoiceDate: '2024-03-01', totalAmount: '10.00', description: 'Queso curado', unitPrice: '1.00' }),
			rid,
		);
		const shocked = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'DEL-002', invoiceDate: '2024-03-08', totalAmount: '20.00', description: 'Queso curado', unitPrice: '2.00' }),
			rid,
		);
		expect(shocked.type).toBe('saved');
		if (shocked.type !== 'saved') return;

		expect(await notifications(shocked.invoiceId, 'price_shock')).toHaveLength(1);

		const result = await runDelete(shocked.invoiceId);
		expect(isRedirect(result)).toBe(true);

		const rows = await notifications(shocked.invoiceId, 'price_shock');
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('resolved');
	});

	it('re-evaluates budget_overage against remaining spend when the triggering invoice is deleted', async () => {
		const supplier = '__reeval_delete_budget__';
		const category = 'Limpieza';
		const month = toMonthStr(new Date());
		const todayIso = new Date().toISOString().slice(0, 10);

		const first = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'DELB-001', invoiceDate: todayIso, totalAmount: '5.00' }),
			rid,
		);
		expect(first.type).toBe('saved');
		if (first.type !== 'saved') return;

		const supplierId = await supplierIdByName(supplier);
		await testDb.update(suppliers).set({ category }).where(eq(suppliers.id, supplierId));
		await testDb.insert(categoryBudgets).values({ restaurantId: rid, category, month, monthlyBudget: '100.00' });

		const overBudget = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'DELB-002', invoiceDate: todayIso, totalAmount: '90.00' }),
			rid,
		);
		expect(overBudget.type).toBe('saved');
		if (overBudget.type !== 'saved') return;

		expect(await notifications(overBudget.invoiceId, 'budget_overage')).toHaveLength(1);

		await runDelete(overBudget.invoiceId);

		const rows = await notifications(overBudget.invoiceId, 'budget_overage');
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('resolved');
	});

	it('resolves supplier_uncategorized once the category is corrected directly on the supplier profile', async () => {
		const supplier = '__reeval_supplier_cat__';

		const created = await saveReviewedInvoice(
			fakeItem(),
			saveForm({ supplier, invoiceNumber: 'SUP-001', invoiceDate: '2024-04-01', totalAmount: '10.00' }),
			rid,
		);
		expect(created.type).toBe('saved');
		if (created.type !== 'saved') return;

		expect(await notifications(created.invoiceId, 'supplier_uncategorized')).toHaveLength(1);

		const supplierId = await supplierIdByName(supplier);
		const fd = new FormData();
		fd.append('name', supplier);
		fd.append('category', 'Bebidas');
		const result = await runSupplierUpdate(supplierId, fd);
		expect(isRedirect(result)).toBe(true);

		const rows = await notifications(created.invoiceId, 'supplier_uncategorized');
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe('resolved');
	});
});
