import { error, redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers } from '$lib/server/schema';
import { asc, eq, and, ne, sql } from 'drizzle-orm';
import { claimRequest, releaseRequest, isValidKey } from '$lib/server/idempotency';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
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
				.where(eq(invoiceLineItems.invoiceId, id))
				.orderBy(asc(invoiceLineItems.id)),
		]);

		const row = rows[0];
		if (!row) redirect(303, '/invoices');

		return { title: 'Edit Invoice', invoice: row, lineItems };
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[invoice/edit] load failed', e);
		error(500, 'Failed to load invoice');
	}
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
		const totalAmount   = toFloat(data.get('total_amount'));
		const notes         = String(data.get('notes') ?? '').slice(0, 250) || null;

		// Optimistic concurrency (issue #242): the form carries the version it
		// loaded; the UPDATE below only fires if it still matches.
		const expectedVersion = Number(data.get('version'));

		// Idempotency key (issue #250) — claimed inside the transaction below.
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
				unitPrice:   toFloat(lineUnitPrices[i] ?? null),
				totalPrice:  toFloat(lineTotalPrices[i] ?? null),
			}))
			.filter((item) => item.description.trim() !== '');

		// Header update + line-item delete/reinsert commit atomically — a crash
		// between the delete and the insert must not destroy the line items.
		let conflict: 'duplicate' | 'stale' | null = null;
		await db.transaction(async (tx) => {
			// Idempotency claim first (#250) — a replayed submit skips the whole
			// edit and falls through to the same /invoices redirect as success.
			if (idemKey && !(await claimRequest(idemKey, rid, tx))) {
				return;
			}

			let supplierId: number | null = null;
			if (supplierName) {
				const existing = await tx.select({ id: suppliers.id })
					.from(suppliers)
					.where(tdb.scope(suppliers.restaurantId, eq(suppliers.name, supplierName)))
					.limit(1);
				if (existing.length > 0) {
					supplierId = existing[0].id;
				} else {
					const inserted = await tx.insert(suppliers)
						.values({ name: supplierName, restaurantId: rid })
						.returning({ id: suppliers.id });
					supplierId = inserted[0].id;
				}
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
					// Release so a corrected resubmit isn't skipped as a replay (#250).
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
					// Tolerate a missing/invalid version (e.g. a form cached from
					// before this field existed) — no guard rather than a hard 409.
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

		// Replay (#250) and success share the destination — the first submit
		// already applied the edit.
		redirect(303, '/invoices');
	},
};
