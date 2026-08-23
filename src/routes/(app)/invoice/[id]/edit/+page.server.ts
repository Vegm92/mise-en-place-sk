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
import { parseLineInputs, enrichLineItems, computeFormContentHash, linkProductsToInvoice } from '$lib/server/invoice-save';

export const load: PageServerLoad = async ({ params, locals }) => {
	return handleLoad('invoice/edit', async () => {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

		const [rows, lineItems] = await Promise.all([
			db.select({
				id:             invoices.id,
				supplier_id:    invoices.supplierId,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				invoice_date:   invoices.invoiceDate,
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface EditInvoiceParams {
	id: number;
	rid: string;
	uid: string;
	tdb: ReturnType<typeof forTenant>;
	idemKey: string | null;
	supplierName: string;
	invoiceNumber: string | null;
	invoiceDate: ReturnType<typeof toIsoDate>;
	totalAmount: ReturnType<typeof toMoneyString>;
	notes: string | null;
	contentHash: ReturnType<typeof computeFormContentHash>;
	expectedVersion: number;
	enrichedLines: Awaited<ReturnType<typeof enrichLineItems>>;
}

async function hasEditConflict(tx: Tx, p: EditInvoiceParams, supplierId: number | null): Promise<boolean> {
	if (supplierId && p.invoiceNumber) {
		const duplicate = await tx
			.select({ id: invoices.id })
			.from(invoices)
			.where(and(
				p.tdb.scope(invoices.restaurantId),
				eq(invoices.supplierId, supplierId),
				eq(invoices.invoiceNumber, p.invoiceNumber),
				ne(invoices.id, p.id),
			))
			.limit(1);
		if (duplicate.length > 0) return true;
	}

	const hashMatch = await tx
		.select({ id: invoices.id })
		.from(invoices)
		.where(and(
			p.tdb.scope(invoices.restaurantId),
			eq(invoices.contentHash, p.contentHash),
			ne(invoices.id, p.id),
			isNull(invoices.deletedAt),
		))
		.limit(1);
	return hashMatch.length > 0;
}

async function performInvoiceEdit(
	tx: Tx,
	p: EditInvoiceParams,
): Promise<{ conflict: 'duplicate' | 'stale' | null; savedSupplierId: number | null }> {
	if (p.idemKey && !(await claimRequest(p.idemKey, p.rid, tx))) {
		return { conflict: null, savedSupplierId: null };
	}

	const [preEditInvoice] = await tx.select()
		.from(invoices)
		.where(p.tdb.scope(invoices.restaurantId, eq(invoices.id, p.id)))
		.limit(1);
	const preEditLines = await tx.select()
		.from(invoiceLineItems)
		.where(p.tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, p.id)))
		.orderBy(asc(invoiceLineItems.id));

	let supplierId: number | null = null;
	if (p.supplierName) {
		supplierId = await getOrCreateSupplierId(p.rid, p.supplierName, tx);
	}

	if (await hasEditConflict(tx, p, supplierId)) {
		if (p.idemKey) await releaseRequest(p.idemKey, tx);
		return { conflict: 'duplicate', savedSupplierId: null };
	}

	const updated = await tx.update(invoices)
		.set({
			supplierId, invoiceNumber: p.invoiceNumber, invoiceDate: p.invoiceDate, totalAmount: p.totalAmount, notes: p.notes, contentHash: p.contentHash,
			version: sql`${invoices.version} + 1`,
		})
		.where(and(
			p.tdb.scope(invoices.restaurantId, eq(invoices.id, p.id)),
			Number.isFinite(p.expectedVersion) ? eq(invoices.version, p.expectedVersion) : undefined,
		))
		.returning({ id: invoices.id });
	if (updated.length === 0) {
		if (p.idemKey) await releaseRequest(p.idemKey, tx);
		return { conflict: 'stale', savedSupplierId: null };
	}

	await tx.delete(invoiceLineItems)
		.where(p.tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, p.id)));

	if (p.enrichedLines.length > 0) {
		await tx.insert(invoiceLineItems).values(
			p.enrichedLines.map((line) => ({ invoiceId: p.id, restaurantId: p.rid, ...line.columns }))
		);
	}

	await tx.insert(invoiceAuditLog).values({
		restaurantId: p.rid,
		invoiceId:    p.id,
		action:       'edit',
		userId:       p.uid,
		snapshot:     JSON.stringify({ invoice: preEditInvoice, lineItems: preEditLines }),
	});

	return { conflict: null, savedSupplierId: supplierId };
}

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;
		const uid = locals.user!.id;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const supplierName  = String(data.get('supplier_name') ?? '').trim();
		const invoiceNumber = String(data.get('invoice_number') ?? '').trim() || null;
		const invoiceDateRaw = data.get('invoice_date');
		if (!isBlankOrIsoDate(invoiceDateRaw)) return fail(400, { errorKey: 'error.invalidInvoiceDate' });
		const invoiceDate   = toIsoDate(invoiceDateRaw);
		const totalAmount   = toMoneyString(data.get('total_amount') as string | null);
		const notes         = String(data.get('notes') ?? '').slice(0, 250) || null;

		const expectedVersion = Number(data.get('version'));

		const idemKeyRaw = data.get('idempotency_key');
		const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;

		const lineInputs = parseLineInputs(data);
		const enrichedLines = await enrichLineItems(rid, supplierName, lineInputs);
		const contentHash = computeFormContentHash(
			{ supplierName, invoiceNumber: invoiceNumber ?? '', invoiceDate, totalAmount },
			data,
		);

		const { conflict, savedSupplierId } = await db.transaction((tx) =>
			performInvoiceEdit(tx, { id, rid, uid, tdb, idemKey, supplierName, invoiceNumber, invoiceDate, totalAmount, notes, contentHash, expectedVersion, enrichedLines })
		);

		if (conflict === 'duplicate') {
			return fail(409, { error: 'Invoice number already exists for this supplier.' });
		}
		if (conflict === 'stale') {
			return fail(409, { error: 'This invoice was changed elsewhere (another tab or user). Reload the page before saving.' });
		}

		if (savedSupplierId != null && enrichedLines.length > 0) {
			await linkProductsToInvoice(id, savedSupplierId, rid, lineInputs);
		}

		redirect(303, '/invoices');
	},
};
