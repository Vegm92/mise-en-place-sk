import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, suppliers, systemNotifications } from '$lib/server/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { markInvoiceReviewed } from '$lib/server/invoice-status';
import { moneyToNumber } from '$lib/server/money';

export const load: PageServerLoad = async ({ locals, url }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('reminders', async () => {
		const rows = await db
			.select({
				id:             invoices.id,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				invoice_date:   invoices.invoiceDate,
				display_amount: sql<string>`COALESCE(${invoices.totalAmount}, 0)`,
				created_at:     invoices.createdAt,
			})
			.from(invoices)
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(and(
				tdb.scope(invoices.restaurantId),
				eq(invoices.reviewState, 'incidencia'),
				isNull(invoices.deletedAt)
			))
			.orderBy(desc(invoices.createdAt));

		const notifRows = await db
			.select()
			.from(systemNotifications)
			.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.status, 'pending')))
			.orderBy(desc(systemNotifications.createdAt));

		const notifications = notifRows.flatMap((n) => {
			let payload: unknown = null;
			if (n.payload) {
				try { payload = JSON.parse(n.payload); } catch { return []; }
			}
			return [{ ...n, payload }];
		});

		return {
			title: 'nav.reminders',
			incidencias: rows.map((r) => ({ ...r, display_amount: moneyToNumber(r.display_amount) })),
			conflict: url.searchParams.get('conflict') === '1',
			notifications,
		};
	});
};

export const actions: Actions = {
	markReviewed: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		const ok = await markInvoiceReviewed(id, locals.restaurantId!);
		redirect(303, ok ? '/reminders' : '/reminders?conflict=1');
	},
};
