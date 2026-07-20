import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { and, asc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { workingDaysUntilDeadline } from '$lib/server/working-days';
import { markInvoicePaid, markInvoicesPaidBulk, acceptInvoice, rejectInvoice } from '$lib/server/invoice-status';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const load: PageServerLoad = async ({ locals, url }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('reminders', async () => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayIso = today.toISOString().split('T')[0]!;
		const weekEnd = new Date(today.getTime() + 7 * 86400_000).toISOString().split('T')[0]!;

		const rows = await db
			.select({
				id:               invoices.id,
				supplier_name:    suppliers.name,
				invoice_number:   invoices.invoiceNumber,
				due_date:         invoices.dueDate,
				display_amount:   sql<number>`COALESCE(${invoices.totalAmount}, 0)`,
				e_invoice_format: invoices.eInvoiceFormat,
				created_at:       invoices.createdAt,
				status:           invoices.status,
			})
			.from(invoices)
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(and(
				tdb.scope(invoices.restaurantId),
				// Show pending AND accepted invoices that have not been paid yet
				sql`${invoices.status} IN ('pending', 'accepted')`,
				isNotNull(invoices.dueDate),
				isNull(invoices.deletedAt),
				lte(invoices.dueDate, weekEnd)
			))
			.orderBy(asc(invoices.dueDate));

		const enriched = rows.map((r) => {
			const dueDays = Math.round((new Date(r.due_date!).getTime() - today.getTime()) / 86400_000);
			// 4-working-day acceptance countdown: only applies to e-invoices still 'pending'
			let acceptanceWorkingDaysLeft: number | null = null;
			if (r.e_invoice_format && r.status === 'pending' && r.created_at) {
				acceptanceWorkingDaysLeft = workingDaysUntilDeadline(r.created_at, today, 4);
			}
			return {
				...r,
				due_date: r.due_date!,
				days_delta: dueDays,
				overdue: dueDays < 0,
				acceptance_working_days_left: acceptanceWorkingDaysLeft,
			};
		});

		return {
			title: 'nav.reminders',
			overdue:       enriched.filter(r => r.overdue),
			due_soon:      enriched.filter(r => !r.overdue),
			total_amount:  enriched.reduce((sum, r) => sum + r.display_amount, 0),
			today:         todayIso,
			conflict:      url.searchParams.get('conflict') === '1',
		};
	});
};

// Guarded transitions (issue #243): a stale tab whose invoice was already
// accepted/rejected/paid elsewhere gets a conflict banner, not a silent
// overwrite of the other change.
export const actions: Actions = {
	markPaid: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		const ok = await markInvoicePaid(id, locals.restaurantId!);
		redirect(303, ok ? '/reminders' : '/reminders?conflict=1');
	},

	bulkPaid: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		if (!await checkRateLimit(`bulk:${rid}`, 10)) redirect(303, '/reminders');
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		await markInvoicesPaidBulk(ids, rid);
		redirect(303, '/reminders');
	},

	/** Accept an e-invoice — starts the paid-status obligation clock (RD 238/2026). */
	acceptInvoice: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		const ok = await acceptInvoice(id, locals.restaurantId!);
		redirect(303, ok ? '/reminders' : '/reminders?conflict=1');
	},

	/** Reject an e-invoice — records the rejection date (RD 238/2026). */
	rejectInvoice: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		const ok = await rejectInvoice(id, locals.restaurantId!);
		redirect(303, ok ? '/reminders' : '/reminders?conflict=1');
	},
};
