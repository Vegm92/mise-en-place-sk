import { db, forTenant } from './db';
import { invoices, suppliers } from './schema';
import { asc, eq, isNotNull, isNull, and } from 'drizzle-orm';
import { median } from './money';

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

function frequencyLabel(medianGap: number): string {
	if (medianGap <= WEEKLY_THRESHOLD_DAYS) return 'weekly';
	if (medianGap <= BIWEEKLY_THRESHOLD_DAYS) return 'biweekly';
	if (medianGap <= MONTHLY_THRESHOLD_DAYS) return 'monthly';
	return 'periodic';
}

function groupDatesBySupplier(rows: SupplierInvoiceDate[]): Map<string, { supplier_id: number | null; dates: Set<string> }> {
	const map = new Map<string, { supplier_id: number | null; dates: Set<string> }>();
	for (const row of rows) {
		if (!row.supplier_name || !row.invoice_date) continue;
		let entry = map.get(row.supplier_name);
		if (!entry) {
			entry = { supplier_id: row.supplier_id ?? null, dates: new Set() };
			map.set(row.supplier_name, entry);
		}
		entry.dates.add(row.invoice_date);
	}
	return map;
}

function supplierCadence(
	name: string,
	supplierId: number | null,
	dates: Set<string>,
	today: Date,
): SupplierCadence | null {
	if (dates.size < 2) return null;

	const sortedDates = [...dates].sort();
	const firstStr = sortedDates[0];
	const lastInvoiceStr = sortedDates[sortedDates.length - 1];
	if (!firstStr || !lastInvoiceStr) return null;

	const lastTs = new Date(lastInvoiceStr).getTime();
	const firstTs = new Date(firstStr).getTime();
	if (Number.isNaN(lastTs) || Number.isNaN(firstTs)) return null;

	const gaps: number[] = [];
	let prevTs = firstTs;
	for (const dStr of sortedDates.slice(1)) {
		const currTs = new Date(dStr).getTime();
		if (Number.isNaN(currTs)) continue;
		gaps.push(Math.round((currTs - prevTs) / 86400000));
		prevTs = currTs;
	}

	if (gaps.length === 0) return null;
	const medianGap = median(gaps);
	if (medianGap < MIN_SUPPLIER_GAP_DAYS) return null;

	const todayTs = today.getTime();
	const daysSinceLast = Math.round((todayTs - lastTs) / 86400000);
	const expectedByTs = lastTs + medianGap * 86400000;
	if (Number.isNaN(expectedByTs)) return null;
	const daysLate = Math.round((todayTs - expectedByTs) / 86400000);

	return {
		supplier_name: name,
		...(supplierId != null ? { supplier_id: supplierId } : {}),
		last_invoice: lastInvoiceStr,
		expected_by: new Date(expectedByTs).toISOString().slice(0, 10),
		days_late: daysLate,
		frequency: frequencyLabel(medianGap),
		median_gap: medianGap,
		late: daysSinceLast > MISSING_INVOICE_MULTIPLIER * medianGap,
	};
}

export function inferSupplierCadence(rows: SupplierInvoiceDate[], today: Date): SupplierCadence[] {
	const supplierDates = groupDatesBySupplier(rows);
	const out: SupplierCadence[] = [];
	for (const [name, { supplier_id, dates }] of supplierDates) {
		const cadence = supplierCadence(name, supplier_id, dates, today);
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
