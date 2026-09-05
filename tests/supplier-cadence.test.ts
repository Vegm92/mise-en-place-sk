/**
 * Supplier cadence — missing-invoice inference extracted from the dashboard loader.
 *
 * Covers the pure rules that used to be untestable inside +page.server.ts:
 *   - median gap drives the frequency label (weekly / biweekly / monthly / periodic)
 *   - a supplier is only late past 1.5x its median gap
 *   - suppliers with erratic (<3 day) or too-few dates are ignored
 *   - alerts come back sorted by days_late, worst first
 */
import { describe, it, expect } from 'vitest';
import { inferSupplierCadence, inferMissingInvoices, type SupplierInvoiceDate } from '../src/lib/server/supplier-cadence';

const TODAY = new Date('2026-03-01T00:00:00Z');

function rows(supplier: string, dates: string[]): SupplierInvoiceDate[] {
	return dates.map((invoice_date) => ({ supplier_name: supplier, invoice_date }));
}

describe('inferMissingInvoices', () => {
	it('flags a weekly supplier that stopped delivering', () => {
		const alerts = inferMissingInvoices(
			rows('Pescados SL', ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']),
			TODAY,
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({
			supplier_name: 'Pescados SL',
			frequency: 'weekly',
			last_invoice: '2026-01-26',
			expected_by: '2026-02-02',
		});
		expect(alerts[0]!.days_late).toBe(27);
	});

	it('labels frequency from the median gap', () => {
		const biweekly = inferMissingInvoices(
			rows('Quincenal', ['2025-11-01', '2025-11-15', '2025-11-29', '2025-12-13']),
			TODAY,
		);
		expect(biweekly[0]!.frequency).toBe('biweekly');

		const monthly = inferMissingInvoices(
			rows('Mensual', ['2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01']),
			TODAY,
		);
		expect(monthly[0]!.frequency).toBe('monthly');

		const periodic = inferMissingInvoices(
			rows('Trimestral', ['2025-01-01', '2025-04-01', '2025-07-01']),
			TODAY,
		);
		expect(periodic[0]!.frequency).toBe('periodic');
	});

	it('stays quiet while the supplier is within 1.5x its median gap', () => {
		const alerts = inferMissingInvoices(
			rows('Puntual', ['2026-02-05', '2026-02-12', '2026-02-19', '2026-02-26']),
			TODAY,
		);
		expect(alerts).toEqual([]);
	});

	it('ignores suppliers with fewer than two invoices or erratic sub-3-day gaps', () => {
		expect(inferMissingInvoices(rows('Unico', ['2025-01-01']), TODAY)).toEqual([]);
		expect(
			inferMissingInvoices(rows('Diario', ['2025-01-01', '2025-01-02', '2025-01-03']), TODAY),
		).toEqual([]);
	});

	it('skips blank rows and deduplicates repeated dates', () => {
		const alerts = inferMissingInvoices(
			[
				...rows('Verduras', ['2026-01-05', '2026-01-05', '2026-01-12', '2026-01-19']),
				{ supplier_name: null, invoice_date: '2026-01-05' },
				{ supplier_name: 'Verduras', invoice_date: null },
			],
			TODAY,
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]!.frequency).toBe('weekly');
	});

	it('sorts the worst offender first', () => {
		const alerts = inferMissingInvoices(
			[
				...rows('Reciente', ['2026-01-05', '2026-01-12', '2026-01-19']),
				...rows('Antiguo', ['2025-06-01', '2025-06-08', '2025-06-15']),
			],
			TODAY,
		);
		expect(alerts.map((a) => a.supplier_name)).toEqual(['Antiguo', 'Reciente']);
		expect(alerts[0]!.days_late).toBeGreaterThan(alerts[1]!.days_late);
	});
});

describe('inferSupplierCadence — every supplier, not only the late ones', () => {
	it('reports the median gap, the next expected date and a late flag per supplier', () => {
		const cadence = inferSupplierCadence([
			{ supplier_id: 1, supplier_name: 'Pescados SL', invoice_date: '2026-01-05' },
			{ supplier_id: 1, supplier_name: 'Pescados SL', invoice_date: '2026-01-12' },
			{ supplier_id: 1, supplier_name: 'Pescados SL', invoice_date: '2026-01-19' },
			{ supplier_id: 2, supplier_name: 'Verduras', invoice_date: '2026-02-20' },
			{ supplier_id: 2, supplier_name: 'Verduras', invoice_date: '2026-02-27' },
		], TODAY);
		expect(cadence.map((c) => c.supplier_name)).toEqual(['Pescados SL', 'Verduras']);
		expect(cadence[0]).toMatchObject({ supplier_id: 1, frequency: 'weekly', median_gap: 7, expected_by: '2026-01-26', late: true });
		expect(cadence[1]).toMatchObject({ supplier_id: 2, frequency: 'weekly', median_gap: 7, expected_by: '2026-03-06', days_late: -5, late: false });
		expect(cadence[1]!.days_late).toBeLessThan(cadence[0]!.days_late);
	});

	it('keeps inferMissingInvoices as the late subset without the cadence-only fields', () => {
		const rows = [
			{ supplier_id: 1, supplier_name: 'Pescados SL', invoice_date: '2026-01-05' },
			{ supplier_id: 1, supplier_name: 'Pescados SL', invoice_date: '2026-01-12' },
		];
		const [missing] = inferMissingInvoices(rows, TODAY);
		expect(missing).toMatchObject({ supplier_id: 1, supplier_name: 'Pescados SL', frequency: 'weekly' });
		expect(missing).not.toHaveProperty('median_gap');
		expect(missing).not.toHaveProperty('late');
	});
});
