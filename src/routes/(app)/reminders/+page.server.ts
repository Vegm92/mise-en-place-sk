import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';

type ReminderRow = {
	id: number;
	supplier_name: string | null;
	invoice_number: string | null;
	due_date: string;
	display_amount: number;
	days_delta: number;
	overdue: boolean;
};

export const load: PageServerLoad = async () => {
	try {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayIso = today.toISOString().split('T')[0];
		const weekEnd = new Date(today.getTime() + 7 * 86400_000).toISOString().split('T')[0];

		const rows = db
			.select({
				id:             invoices.id,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				due_date:       invoices.dueDate,
				display_amount: sql<number>`COALESCE(${invoices.totalAmount}, 0)`,
			})
			.from(invoices)
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(
				and(
					eq(invoices.status, 'pending'),
					isNotNull(invoices.dueDate),
					lte(invoices.dueDate, weekEnd)
				)
			)
			.orderBy(asc(invoices.dueDate))
			.all();

		const enriched: ReminderRow[] = rows.map((r) => {
			const dueDays = Math.round(
				(new Date(r.due_date!).getTime() - today.getTime()) / 86400_000
			);
			return { ...r, due_date: r.due_date!, days_delta: dueDays, overdue: dueDays < 0 };
		});

		const overdue    = enriched.filter((r) => r.overdue);
		const due_soon   = enriched.filter((r) => !r.overdue);
		const total_amount = enriched.reduce((sum, r) => sum + r.display_amount, 0);

		return {
			title: 'Payment Reminders',
			overdue,
			due_soon,
			total_amount,
			today: todayIso,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[reminders] load failed', e);
		error(500, 'Failed to load reminders');
	}
};

export const actions: Actions = {
	markPaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, id)).run();
		redirect(303, '/reminders');
	},
};
