export const NEW_SUPPLIER_WINDOW_DAYS = 30;

export function supplierSpendDeltaPct(monthSpend: number, lastMonthSpend: number): number | null {
	if (!(monthSpend > 0) || !(lastMonthSpend > 0)) return null;
	return ((monthSpend - lastMonthSpend) / lastMonthSpend) * 100;
}

function isoDay(value: string | Date): string {
	return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export function isNewSupplier(
	firstInvoiceDate: string | Date | null | undefined,
	today: string,
	windowDays: number = NEW_SUPPLIER_WINDOW_DAYS,
): boolean {
	if (!firstInvoiceDate) return false;
	const cutoff = new Date(`${today}T00:00:00Z`);
	if (Number.isNaN(cutoff.getTime())) return false;
	cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
	return isoDay(firstInvoiceDate) >= cutoff.toISOString().slice(0, 10);
}
