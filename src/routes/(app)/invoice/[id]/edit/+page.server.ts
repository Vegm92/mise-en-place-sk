import { redirect, fail } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers } from '$lib/server/schema';
import { asc, eq, and, ne, sql, isNull } from 'drizzle-orm';
import { claimRequest, releaseRequest, isValidKey } from '$lib/server/idempotency';
import { getOrCreateSupplierId } from '$lib/server/supplier';
import { toMoneyString, moneyToNullableNumber } from '$lib/server/money';
import { isBlankOrIsoDate, toIsoDate } from '$lib/server/dates';
import { parseLineInputs, enrichLineItems, computeFormContentHash, linkProductsToInvoice, findInvalidMonetaryField } from '$lib/server/invoice-save';
import { reevaluateInvoiceAlerts } from '$lib/server/alerts';
import { requirePositiveIntId } from '$lib/server/route-params';
import type { TaxBand } from '$lib/tax';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TenantDb = ReturnType<typeof forTenant>;
type EditConflict = 'duplicate' | 'stale' | null;

async function storedTaxBands(tdb: TenantDb, id: number): Promise<TaxBand[] | null> {
	const [row] = await db.select({ taxBreakdown: invoices.taxBreakdown }).from(invoices)
		.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id))).limit(1);
	if (!row?.taxBreakdown) return null;
	try {
		const parsed = JSON.parse(row.taxBreakdown);
		return Array.isArray(parsed) ? (parsed as TaxBand[]) : null;
	} catch {
		return null;
	}
}

async function checkDuplicateInvoice(
	tx: Tx, tdb: TenantDb, id: number,
	supplierId: number | null, invoiceNumber: string | null, contentHash: string,
): Promise<boolean> {
	if (supplierId && invoiceNumber) {
		const dup = await tx.select({ id: invoices.id }).from(invoices)
			.where(and(tdb.scope(invoices.restaurantId), eq(invoices.supplierId, supplierId), eq(invoices.invoiceNumber, invoiceNumber), ne(invoices.id, id)))
			.limit(1);
		if (dup.length > 0) return true;
	}
	const hashMatch = await tx.select({ id: invoices.id }).from(invoices)
		.where(and(tdb.scope(invoices.restaurantId), eq(invoices.contentHash, contentHash), ne(invoices.id, id), isNull(invoices.deletedAt)))
		.limit(1);
	return hashMatch.length > 0;
}

async function executeEditTransaction(
	tx: Tx, tdb: TenantDb, id: number, rid: string, uid: string,
	idemKey: string | null, supplierName: string, invoiceNumber: string | null,
	invoiceDate: string | null, dueDate: string | null, totalAmount: string | null,
	notes: string | null, contentHash: string, expectedVersion: number,
	enrichedLines: Awaited<ReturnType<typeof enrichLineItems>>,
): Promise<{ conflict: EditConflict; savedSupplierId: number | null; documentType: 'factura' | 'albaran' | null }> {
	if (idemKey && !(await claimRequest(idemKey, rid, tx))) {
		return { conflict: null, savedSupplierId: null, documentType: null };
	}
	const [preEditInvoice] = await tx.select().from(invoices)
		.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id))).limit(1);
	const preEditLines = await tx.select().from(invoiceLineItems)
		.where(tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, id)))
		.orderBy(asc(invoiceLineItems.id));
	const documentType = (preEditInvoice?.documentType as 'factura' | 'albaran' | null) ?? null;
	let supplierId: number | null = null;
	if (supplierName) supplierId = await getOrCreateSupplierId(rid, supplierName, tx);
	if (await checkDuplicateInvoice(tx, tdb, id, supplierId, invoiceNumber, contentHash)) {
		if (idemKey) await releaseRequest(idemKey, tx);
		return { conflict: 'duplicate', savedSupplierId: null, documentType };
	}
	const updated = await tx.update(invoices)
		.set({ supplierId, invoiceNumber, invoiceDate, dueDate, totalAmount, notes, contentHash, version: sql`${invoices.version} + 1` })
		.where(and(tdb.scope(invoices.restaurantId, eq(invoices.id, id)), eq(invoices.version, expectedVersion)))
		.returning({ id: invoices.id });
	if (updated.length === 0) {
		if (idemKey) await releaseRequest(idemKey, tx);
		return { conflict: 'stale', savedSupplierId: null, documentType };
	}
	await tx.delete(invoiceLineItems)
		.where(tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, id)));
	if (enrichedLines.length > 0) {
		await tx.insert(invoiceLineItems).values(
			enrichedLines.map((line) => ({ invoiceId: id, restaurantId: rid, ...line.columns }))
		);
	}
	await tx.insert(invoiceAuditLog).values({
		restaurantId: rid, invoiceId: id, action: 'edit', userId: uid,
		snapshot: JSON.stringify({ invoice: preEditInvoice, lineItems: preEditLines }),
	});
	return { conflict: null, savedSupplierId: supplierId, documentType };
}

export const load: PageServerLoad = async ({ params, locals }) => {
	return handleLoad('invoice/edit', async () => {
		const id  = requirePositiveIntId(params.id, 'invoice');
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

		const [rows, lineItems] = await Promise.all([
			db.select({
				id:             invoices.id,
				supplier_id:    invoices.supplierId,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				invoice_date:   invoices.invoiceDate,
				due_date:       invoices.dueDate,
				total_amount:   invoices.totalAmount,
				status:         invoices.status,
				source_file:    invoices.sourceFile,
				notes:          invoices.notes,
				created_at:     invoices.createdAt,
				version:        invoices.version,
			})
				.from(invoices)
				.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
				.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)))
				.limit(1),

			db.select({
				id:          invoiceLineItems.id,
				invoice_id:  invoiceLineItems.invoiceId,
				description: invoiceLineItems.description,
				quantity:    invoiceLineItems.quantity,
				unit:        invoiceLineItems.unit,
				unit_price:  invoiceLineItems.unitPrice,
				total_price: invoiceLineItems.totalPrice,
				tax_rate:    invoiceLineItems.taxRate,
				supplier_sku: invoiceLineItems.supplierSku,
			})
				.from(invoiceLineItems)
				.where(tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, id)))
				.orderBy(asc(invoiceLineItems.id)),
		]);

		const row = rows[0];
		if (!row) redirect(303, '/invoices');

		return {
			title: 'edit.pageTitle',
			invoice: { ...row, total_amount: moneyToNullableNumber(row.total_amount) },
			lineItems: lineItems.map(li => ({
				...li,
				unit_price: moneyToNullableNumber(li.unit_price),
				total_price: moneyToNullableNumber(li.total_price),
			})),
		};
	});
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const id  = requirePositiveIntId(params.id, 'invoice');
		const rid = locals.restaurantId!;
		const uid = locals.user!.id;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const supplierName  = String(data.get('supplier_name') ?? '').trim();
		const invoiceNumber = String(data.get('invoice_number') ?? '').trim() || null;
		const invoiceDateRaw = data.get('invoice_date');
		const dueDateRaw     = data.get('due_date');
		if (!isBlankOrIsoDate(invoiceDateRaw)) return fail(400, { errorKey: 'error.invalidInvoiceDate' });
		if (!isBlankOrIsoDate(dueDateRaw))     return fail(400, { errorKey: 'error.invalidDueDate' });
		if (findInvalidMonetaryField(data))    return fail(400, { errorKey: 'error.invalidAmount' });
		const invoiceDate   = toIsoDate(invoiceDateRaw);
		const dueDate       = toIsoDate(dueDateRaw);
		const totalAmount   = toMoneyString(data.get('total_amount') as string | null);
		const notes         = String(data.get('notes') ?? '').slice(0, 250) || null;

		const expectedVersion = Number(data.get('version'));
		if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
			return fail(400, { errorKey: 'error.invalidVersion' });
		}

		const idemKeyRaw = data.get('idempotency_key');
		const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;

		const lineInputs = parseLineInputs(data);
		const enrichedLines = await enrichLineItems(rid, supplierName, lineInputs);
		const contentHash = computeFormContentHash(
			{ supplierName, invoiceNumber: invoiceNumber ?? '', invoiceDate, dueDate, totalAmount },
			data,
			await storedTaxBands(tdb, id),
		);

		let conflict: EditConflict = null;
		let savedSupplierId: number | null = null;
		let documentType: 'factura' | 'albaran' | null = null;
		await db.transaction(async (tx) => {
			({ conflict, savedSupplierId, documentType } = await executeEditTransaction(
				tx, tdb, id, rid, uid, idemKey, supplierName, invoiceNumber,
				invoiceDate, dueDate, totalAmount, notes, contentHash, expectedVersion, enrichedLines,
			));
		});

		if (conflict === 'duplicate') {
			return fail(409, { error: 'Invoice number already exists for this supplier.' });
		}
		if (conflict === 'stale') {
			return fail(409, { error: 'This invoice was changed elsewhere (another tab or user). Reload the page before saving.' });
		}

		if (savedSupplierId != null) {
			let productByKey: Map<string, number> | undefined;
			if (enrichedLines.length > 0) {
				({ productByKey } = await linkProductsToInvoice(id, savedSupplierId, rid, lineInputs));
			}

			await reevaluateInvoiceAlerts({
				invoiceId: id,
				restaurantId: rid,
				supplierId: savedSupplierId,
				supplierName,
				invoiceNumber,
				invoiceDate,
				totalAmount,
				documentType,
				lineItems: enrichedLines.map((line) => line.item),
				lineDescriptions: lineInputs.map((li) => li.desc),
				productByKey,
			});
		}

		redirect(303, '/invoices');
	},
};
