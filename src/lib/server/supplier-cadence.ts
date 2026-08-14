import { db, forTenant } from './db';
import { invoices, suppliers } from './schema';
import { asc, eq, isNotNull, isNull, and } from 'drizzle-orm';

const MIN_SUPPLIER_GAP_DAYS      = 3;
const MISSING_INVOICE_MULTIPLIER = 1.5;
const WEEKLY_THRESHOLD_DAYS      = 10;
const BIWEEKLY_THRESHOLD_DAYS    = 20;
const MONTHLY_THRESHOLD_DAYS     = 45;

export type SupplierInvoiceDate = {
	supplier_name: string | null;
	invoice_date: string | null;
};

export type MissingInvoiceAlert = {
	supplier_name: string;
	last_invoice: string;
	expected_by: string;
	days_late: number;
	frequency: string;
};

export function inferMissingInvoices(rows: SupplierInvoiceDate[], today: Date): MissingInvoiceAlert[] {
	const supplierDates: Record<string, Set<string>> = {};
	for (const row of rows) {
		if (!row.supplier_name || !row.invoice_date) continue;
		if (!supplierDates[row.supplier_name]) supplierDates[row.supplier_name] = new Set();
		supplierDates[row.supplier_name].add(row.invoice_date);
	}

	const alerts: MissingInvoiceAlert[] = [];

	for (const [name, rawDates] of Object.entries(supplierDates)) {
		const dateObjs = [...rawDates].map((d) => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
		if (dateObjs.length < 2) continue;

		const gaps = dateObjs.slice(1).map((d, i) =>
			Math.round((d.getTime() - dateObjs[i]!.getTime()) / 86400000)
		);
		const sorted = [...gaps].sort((a, b) => a - b);
		const n = sorted.length;
		const medianGap = n % 2 === 0
			? ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2
			: sorted[Math.floor(n / 2)] ?? 0;

		if (medianGap < MIN_SUPPLIER_GAP_DAYS) continue;

		const last = dateObjs[dateObjs.length - 1];
		if (!last) continue;
		const daysSinceLast = Math.round((today.getTime() - last.getTime()) / 86400000);
		if (daysSinceLast <= MISSING_INVOICE_MULTIPLIER * medianGap) continue;

		const expectedBy = new Date(last.getTime() + medianGap * 86400000);
		const daysLate = Math.round((today.getTime() - expectedBy.getTime()) / 86400000);

		let frequency = 'periodic';
		if (medianGap <= WEEKLY_THRESHOLD_DAYS)         frequency = 'weekly';
		else if (medianGap <= BIWEEKLY_THRESHOLD_DAYS)  frequency = 'biweekly';
		else if (medianGap <= MONTHLY_THRESHOLD_DAYS)   frequency = 'monthly';

		alerts.push({
			supplier_name: name,
			last_invoice: last.toISOString().split('T')[0]!,
			expected_by: expectedBy.toISOString().split('T')[0]!,
			days_late: daysLate,
			frequency,
		});
	}

	return alerts.sort((a, b) => b.days_late - a.days_late);
}

export async function detectMissingInvoices(restaurantId: string, today: Date): Promise<MissingInvoiceAlert[]> {
	const tdb = forTenant(restaurantId);
	const rows = await db
		.select({ supplier_name: suppliers.name, invoice_date: invoices.invoiceDate })
		.from(invoices)
		.innerJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNotNull(invoices.invoiceDate),
			isNull(invoices.deletedAt)
		))
		.orderBy(asc(suppliers.id), asc(invoices.invoiceDate));

	return inferMissingInvoices(rows, today);
}
