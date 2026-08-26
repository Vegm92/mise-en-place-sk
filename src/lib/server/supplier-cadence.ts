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

function groupDatesBySupplier(rows: SupplierInvoiceDate[]): Record<string, Set<string>> {
	const map: Record<string, Set<string>> = {};
	for (const row of rows) {
		if (!row.supplier_name || !row.invoice_date) continue;
		map[row.supplier_name] ??= new Set();
		map[row.supplier_name].add(row.invoice_date);
	}
	return map;
}

function medianOf(nums: number[]): number {
	const s = [...nums].sort((a, b) => a - b);
	const n = s.length;
	return n % 2 === 0 ? ((s[n / 2 - 1] ?? 0) + (s[n / 2] ?? 0)) / 2 : s[Math.floor(n / 2)] ?? 0;
}

function frequencyLabel(medianGap: number): string {
	if (medianGap <= WEEKLY_THRESHOLD_DAYS) return 'weekly';
	if (medianGap <= BIWEEKLY_THRESHOLD_DAYS) return 'biweekly';
	if (medianGap <= MONTHLY_THRESHOLD_DAYS) return 'monthly';
	return 'periodic';
}

function supplierAlert(name: string, dateObjs: Date[], today: Date): MissingInvoiceAlert | null {
	if (dateObjs.length < 2) return null;
	const gaps = dateObjs.slice(1).map((d, i) =>
		Math.round((d.getTime() - dateObjs[i]!.getTime()) / 86400000)
	);
	const medianGap = medianOf(gaps);
	if (medianGap < MIN_SUPPLIER_GAP_DAYS) return null;
	const last = dateObjs[dateObjs.length - 1];
	if (!last) return null;
	const daysSinceLast = Math.round((today.getTime() - last.getTime()) / 86400000);
	if (daysSinceLast <= MISSING_INVOICE_MULTIPLIER * medianGap) return null;
	const expectedBy = new Date(last.getTime() + medianGap * 86400000);
	const daysLate = Math.round((today.getTime() - expectedBy.getTime()) / 86400000);
	return {
		supplier_name: name,
		last_invoice: last.toISOString().split('T')[0]!,
		expected_by: expectedBy.toISOString().split('T')[0]!,
		days_late: daysLate,
		frequency: frequencyLabel(medianGap),
	};
}

export function inferMissingInvoices(rows: SupplierInvoiceDate[], today: Date): MissingInvoiceAlert[] {
	const supplierDates = groupDatesBySupplier(rows);
	const alerts: MissingInvoiceAlert[] = [];
	for (const [name, rawDates] of Object.entries(supplierDates)) {
		const dateObjs = [...rawDates].map((d) => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
		const alert = supplierAlert(name, dateObjs, today);
		if (alert) alerts.push(alert);
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
