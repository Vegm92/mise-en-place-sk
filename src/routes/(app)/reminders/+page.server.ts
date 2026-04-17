import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dbClient } from '$lib/server/db';

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
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayIso = today.toISOString().split('T')[0];
	const weekEnd = new Date(today.getTime() + 7 * 86400_000).toISOString().split('T')[0];

	const rows = dbClient.prepare(`
		SELECT i.id, s.name AS supplier_name, i.invoice_number,
		       i.due_date, COALESCE(i.total_amount, 0) AS display_amount
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		WHERE i.status = 'pending'
		  AND i.due_date IS NOT NULL
		  AND i.due_date <= ?
		ORDER BY i.due_date ASC
	`).all(weekEnd) as { id: number; supplier_name: string | null; invoice_number: string | null; due_date: string; display_amount: number }[];

	const enriched: ReminderRow[] = rows.map((r) => {
		const dueDays = Math.round(
			(new Date(r.due_date).getTime() - today.getTime()) / 86400_000
		);
		return { ...r, days_delta: dueDays, overdue: dueDays < 0 };
	});

	const overdue = enriched.filter((r) => r.overdue);
	const due_soon = enriched.filter((r) => !r.overdue);
	const total_amount = enriched.reduce((sum, r) => sum + r.display_amount, 0);

	return {
		title: 'Payment Reminders',
		overdue,
		due_soon,
		total_amount,
		today: todayIso,
	};
};

export const actions: Actions = {
	markPaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		dbClient.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(id);
		redirect(303, '/reminders');
	},
};
