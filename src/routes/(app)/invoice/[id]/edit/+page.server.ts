import { redirect, fail } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers } from '$lib/server/schema';
import { asc, eq, and, ne, sql } from 'drizzle-orm';
import { claimRequest, releaseRequest, isValidKey } from '$lib/server/idempotency';
import { getOrCreateSupplierId } from '$lib/server/supplier';
import { toMoneyString, moneyToNullableNumber } from '$lib/server/money';

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

function toFloat(value: FormDataEntryValue | null): number | null {
	if (!value) return null;
	const n = parseFloat(String(value));
	return isNaN(n) ? null : n;
}

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const supplierName  = String(data.get('supplier_name') ?? '').trim();
		const invoiceNumber = String(data.get('invoice_number') ?? '').trim() || null;
		const invoiceDate   = String(data.get('invoice_date') ?? '').trim() || null;
		const dueDate       = String(data.get('due_date') ?? '').trim() || null;
		const totalAmount   = toMoneyString(data.get('total_amount') as string | null);
		const notes         = String(data.get('notes') ?? '').slice(0, 250) || null;

		const expectedVersion = Number(data.get('version'));

		const idemKeyRaw = data.get('idempotency_key');
		const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;

		const lineDescriptions = data.getAll('line_descriptions').map(String);
		const lineQuantities   = data.getAll('line_quantities').map(String);
		const lineUnits        = data.getAll('line_units').map(String);
		const lineUnitPrices   = data.getAll('line_unit_prices').map(String);
		const lineTotalPrices  = data.getAll('line_total_prices').map(String);

		const newItems = lineDescriptions
			.map((desc, i) => ({
				description: desc,
				quantity:    toFloat(lineQuantities[i] ?? null),
				unit:        lineUnits[i]?.trim() || null,
				unitPrice:   toMoneyString(lineUnitPrices[i] ?? null),
				totalPrice:  toMoneyString(lineTotalPrices[i] ?? null),
			}))
			.filter((item) => item.description.trim() !== '');

		let conflict: 'duplicate' | 'stale' | null = null;
		await db.transaction(async (tx) => {
			if (idemKey && !(await claimRequest(idemKey, rid, tx))) {
				return;
			}

			let supplierId: number | null = null;
			if (supplierName) {
				supplierId = await getOrCreateSupplierId(rid, supplierName, tx);
			}

			if (supplierId && invoiceNumber) {
				const duplicate = await tx
					.select({ id: invoices.id })
					.from(invoices)
					.where(and(
						tdb.scope(invoices.restaurantId),
						eq(invoices.supplierId, supplierId),
						eq(invoices.invoiceNumber, invoiceNumber),
						ne(invoices.id, id),
					))
					.limit(1);
				if (duplicate.length > 0) {
					conflict = 'duplicate';
					if (idemKey) await releaseRequest(idemKey, tx);
					return;
				}
			}

			const updated = await tx.update(invoices)
				.set({
					supplierId, invoiceNumber, invoiceDate, dueDate, totalAmount, notes,
					version: sql`${invoices.version} + 1`,
				})
				.where(and(
					tdb.scope(invoices.restaurantId, eq(invoices.id, id)),
					Number.isFinite(expectedVersion) ? eq(invoices.version, expectedVersion) : undefined,
				))
				.returning({ id: invoices.id });
			if (updated.length === 0) {
				conflict = 'stale';
				if (idemKey) await releaseRequest(idemKey, tx);
				return;
			}

			await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

			if (newItems.length > 0) {
				await tx.insert(invoiceLineItems).values(
					newItems.map((item) => ({ invoiceId: id, restaurantId: rid, ...item }))
				);
			}
		});

		if (conflict === 'duplicate') {
			return fail(409, { error: 'Invoice number already exists for this supplier.' });
		}
		if (conflict === 'stale') {
			return fail(409, { error: 'This invoice was changed elsewhere (another tab or user). Reload the page before saving.' });
		}

		redirect(303, '/invoices');
	},
};
