/**
 * The single-line-item saveReviewedInvoice form/batch-item pair shared by
 * the DB-backed suites that only care about the header fields, not the
 * line items themselves (tests/supplier-contact-save.test.ts,
 * tests/restaurant-phone-signal.test.ts). Centralized so the same literal
 * shape doesn't reappear per file (jscpd / `pnpm lint:duplication`).
 */
import { fakeBatchItem } from './batch-item';
import type { BatchItem } from '../../src/lib/server/batch';

export function minimalInvoiceForm(supplier: string, invoiceNumber: string): FormData {
	const fd = new FormData();
	fd.append('supplier_name', supplier);
	fd.append('invoice_number', invoiceNumber);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', '100');
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', 'Aceite de oliva');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'garrafa');
	fd.append('line_unit_prices', '100');
	fd.append('line_total_prices', '100');
	fd.append('line_tax_rates', '');
	return fd;
}

export function minimalBatchItem(restaurantId: string, extractedData: Record<string, unknown> | null): BatchItem {
	return fakeBatchItem({
		id: 'test-item',
		batchId: 'test-batch',
		restaurantId,
		fileKey: 'test.pdf',
		displayName: 'test.pdf',
		extractedData,
	});
}
