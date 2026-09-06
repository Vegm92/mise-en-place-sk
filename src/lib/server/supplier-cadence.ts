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
	supplier_id?: number | null;
};

export type MissingInvoiceAlert = {
	supplier_name: string;
	last_invoice: string;
	expected_by: string;
	days_late: number;
	frequency: string;
	supplier_id?: number;
};

export type SupplierCadence = MissingInvoiceAlert & {
	median_gap: number;
	late: boolean;
};

type SupplierDates = { supplier_id: number | null; dates: Set<string> };

function groupDatesBySupplier(rows: SupplierInvoiceDate[]): Record<string, SupplierDates> {
	const map: Record<string, SupplierDates> = {};
	for (const row of rows) {
		if (!row.supplier_name || !row.invoice_date) continue;
		const entry = (map[row.supplier_name] ??= { supplier_id: row.supplier_id ?? null, dates: new Set() });
		entry.dates.add(row.invoice_date);
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

function supplierCadence(name: string, supplierId: number | null, dateObjs: Date[], today: Date): SupplierCadence | null {
	if (dateObjs.length < 2) return null;
	const gaps = dateObjs.slice(1).map((d, i) =>
		Math.round((d.getTime() - dateObjs[i]!.getTime()) / 86400000)
	);
	const medianGap = medianOf(gaps);
	if (medianGap < MIN_SUPPLIER_GAP_DAYS) return null;
	const last = dateObjs[dateObjs.length - 1];
	if (!last) return null;
	const daysSinceLast = Math.round((today.getTime() - last.getTime()) / 86400000);
	const expectedBy = new Date(last.getTime() + medianGap * 86400000);
	const daysLate = Math.round((today.getTime() - expectedBy.getTime()) / 86400000);
	return {
		supplier_name: name,
		...(supplierId != null ? { supplier_id: supplierId } : {}),
		last_invoice: last.toISOString().split('T')[0]!,
		expected_by: expectedBy.toISOString().split('T')[0]!,
		days_late: daysLate,
		frequency: frequencyLabel(medianGap),
		median_gap: medianGap,
		late: daysSinceLast > MISSING_INVOICE_MULTIPLIER * medianGap,
	};
}

export function inferSupplierCadence(rows: SupplierInvoiceDate[], today: Date): SupplierCadence[] {
	const supplierDates = groupDatesBySupplier(rows);
	const out: SupplierCadence[] = [];
	for (const [name, { supplier_id, dates }] of Object.entries(supplierDates)) {
		const dateObjs = [...dates].map((d) => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
		const cadence = supplierCadence(name, supplier_id, dateObjs, today);
		if (cadence) out.push(cadence);
	}
	return out.sort((a, b) => b.days_late - a.days_late);
}

export function inferMissingInvoices(rows: SupplierInvoiceDate[], today: Date): MissingInvoiceAlert[] {
	return inferSupplierCadence(rows, today)
		.filter((c) => c.late)
		.map(({ median_gap: _gap, late: _late, ...alert }) => alert);
}

async function supplierInvoiceDates(restaurantId: string): Promise<SupplierInvoiceDate[]> {
	const tdb = forTenant(restaurantId);
	return db
		.select({ supplier_id: suppliers.id, supplier_name: suppliers.name, invoice_date: invoices.invoiceDate })
		.from(invoices)
		.innerJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNotNull(invoices.invoiceDate),
			isNull(invoices.deletedAt)
		))
		.orderBy(asc(suppliers.id), asc(invoices.invoiceDate));
}

export async function detectMissingInvoices(restaurantId: string, today: Date): Promise<MissingInvoiceAlert[]> {
	return inferMissingInvoices(await supplierInvoiceDates(restaurantId), today);
}

export async function supplierCadences(restaurantId: string, today: Date): Promise<Map<number, SupplierCadence>> {
	const out = new Map<number, SupplierCadence>();
	for (const cadence of inferSupplierCadence(await supplierInvoiceDates(restaurantId), today)) {
		if (cadence.supplier_id != null) out.set(cadence.supplier_id, cadence);
	}
	return out;
}
