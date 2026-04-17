import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, dbClient as client } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers } from '$lib/server/schema';
import { eq, sql, inArray } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get('status') ?? '';
	const supplierId = url.searchParams.get('supplier_id') ?? '';
	const dateFrom = url.searchParams.get('date_from') ?? '';
	const dateTo = url.searchParams.get('date_to') ?? '';

	// Build WHERE clauses for raw SQL
	const filterClauses: string[] = [];
	const params: (string | number)[] = [];

	if (status) {
		filterClauses.push("i.status = ?");
		params.push(status);
	}
	if (supplierId) {
		filterClauses.push("i.supplier_id = ?");
		params.push(parseInt(supplierId, 10));
	}
	if (dateFrom) {
		filterClauses.push("i.invoice_date >= ?");
		params.push(dateFrom);
	}
	if (dateTo) {
		filterClauses.push("i.invoice_date <= ?");
		params.push(dateTo);
	}

	const where = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : '';

	// Use raw SQL for the join + filter query

	const invoiceRows = client.prepare(`
		SELECT
			i.id, s.name AS supplier_name, i.invoice_number,
			i.invoice_date, i.due_date, i.total_amount,
			i.status, i.confidence, i.source_file, i.created_at, i.notes
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		${where}
		ORDER BY i.created_at DESC
	`).all(...params) as {
		id: number;
		supplier_name: string | null;
		invoice_number: string | null;
		invoice_date: string | null;
		due_date: string | null;
		total_amount: number | null;
		status: string | null;
		confidence: number | null;
		source_file: string | null;
		created_at: string | null;
		notes: string | null;
	}[];

	// Fetch line items for each invoice
	const lineItemStmt = client.prepare(
		'SELECT description, quantity, unit, unit_price, total_price FROM invoice_line_items WHERE invoice_id = ?'
	);

	const invoiceList = invoiceRows.map((inv) => ({
		...inv,
		line_items: lineItemStmt.all(inv.id) as {
			description: string | null;
			quantity: number | null;
			unit: string | null;
			unit_price: number | null;
			total_price: number | null;
		}[],
	}));

	// Stats (global, not filtered)
	const today = new Date().toISOString().split('T')[0];
	const stats = client.prepare(`
		SELECT
			COALESCE(SUM(CASE WHEN status = 'pending' THEN COALESCE(total_amount, 0) ELSE 0 END), 0) AS pending_amount,
			COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
			COUNT(CASE WHEN status = 'pending' AND due_date < ? AND due_date IS NOT NULL THEN 1 END) AS overdue_count,
			COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count
		FROM invoices
	`).get(today) as {
		pending_amount: number;
		pending_count: number;
		overdue_count: number;
		paid_count: number;
	};

	const supplierCount = (client.prepare('SELECT COUNT(*) AS cnt FROM suppliers').get() as { cnt: number }).cnt;

	// Suppliers for filter dropdown
	const supplierRows = filterClauses.length > 0
		? client.prepare(`
			SELECT DISTINCT s.id, s.name FROM suppliers s
			INNER JOIN invoices i ON s.id = i.supplier_id
			${where}
			ORDER BY s.name
		  `).all(...params) as { id: number; name: string }[]
		: client.prepare('SELECT id, name FROM suppliers ORDER BY name').all() as { id: number; name: string }[];

	return {
		title: 'Invoices',
		invoices: invoiceList,
		stats: { ...stats, supplier_count: supplierCount },
		suppliers: supplierRows,
		filters: { status, supplier_id: supplierId, date_from: dateFrom, date_to: dateTo },
	};
};

export const actions: Actions = {
	markPaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, id));
		redirect(303, '/invoices');
	},

	markUnpaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.update(invoices).set({ status: 'pending' }).where(eq(invoices.id, id));
		redirect(303, '/invoices');
	},

	deleteInvoice: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
		await db.delete(invoices).where(eq(invoices.id, id));
		redirect(303, '/invoices');
	},

	bulkPaid: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		if (ids.length > 0) {
			await db.update(invoices).set({ status: 'paid' }).where(inArray(invoices.id, ids));
		}
		redirect(303, '/invoices');
	},

	bulkDelete: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		if (ids.length > 0) {
			await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, ids));
			await db.delete(invoices).where(inArray(invoices.id, ids));
		}
		redirect(303, '/invoices');
	},

	saveNote: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const note = String(data.get('note') ?? '').slice(0, 250) || null;
		await db.update(invoices).set({ notes: note }).where(eq(invoices.id, id));
		// Return JSON-like response — the note save is called via fetch, not a full form POST
		return { ok: true };
	},
};
