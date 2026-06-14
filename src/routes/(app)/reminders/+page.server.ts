import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { and, asc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	try {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayIso = today.toISOString().split('T')[0]!;
		const weekEnd = new Date(today.getTime() + 7 * 86400_000).toISOString().split('T')[0]!;

		const rows = await db
			.select({
				id:             invoices.id,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				due_date:       invoices.dueDate,
				display_amount: sql<number>`COALESCE(${invoices.totalAmount}, 0)`,
			})
			.from(invoices)
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(and(
				tdb.scope(invoices.restaurantId),
				eq(invoices.status, 'pending'),
				isNotNull(invoices.dueDate),
				isNull(invoices.deletedAt),
				lte(invoices.dueDate, weekEnd)
			))
			.orderBy(asc(invoices.dueDate));

		const enriched = rows.map((r) => {
			const dueDays = Math.round((new Date(r.due_date!).getTime() - today.getTime()) / 86400_000);
			return { ...r, due_date: r.due_date!, days_delta: dueDays, overdue: dueDays < 0 };
		});

		return {
			title: 'Payment Reminders',
			overdue:       enriched.filter(r => r.overdue),
			due_soon:      enriched.filter(r => !r.overdue),
			total_amount:  enriched.reduce((sum, r) => sum + r.display_amount, 0),
			today:         todayIso,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[reminders] load failed', e);
		error(500, 'Failed to load reminders');
	}
};

export const actions: Actions = {
	markPaid: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		await db.update(invoices).set({ status: 'paid' })
			.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)));
		redirect(303, '/reminders');
	},
};
