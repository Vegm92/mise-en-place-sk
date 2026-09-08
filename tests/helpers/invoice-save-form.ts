/**
 * The single-line-item saveReviewedInvoice form/batch-item pair shared by
 * the DB-backed suites that only care about the header fields, not the
 * line items themselves (tests/supplier-contact-save.test.ts,
 * tests/restaurant-phone-signal.test.ts). Centralized so the same literal
 * shape doesn't reappear per file (jscpd / `pnpm lint:duplication`).
 */
import { expect } from 'vitest';
import { fakeBatchItem } from './batch-item';
import type { BatchItem } from '../../src/lib/server/batch';
import { saveReviewedInvoice } from '../../src/lib/server/invoice-save';

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

/**
 * A multi-line-item saveReviewedInvoice form, keyed by supplier and a list
 * of `{ desc, unit, price }` lines (tests/570-classifier-trigger-chain,
 * tests/invoice-save-category, tests/invoice-save-products). Some of these
 * suites need `low_confidence_ack` omitted entirely rather than sent as
 * 'true' (invoice-save-products) — pass `lowConfidenceAck: false` for that;
 * every other caller gets today's default of sending it.
 */
export function lineItemInvoiceForm(
	supplier: string,
	lines: Array<{ desc: string; unit: string; price: string }>,
	opts: { lowConfidenceAck?: boolean } = {},
): FormData {
	const fd = new FormData();
	fd.append('supplier_name', supplier);
	fd.append('invoice_number', `INV-${Math.random().toString(36).slice(2, 8)}`);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', '100');
	if (opts.lowConfidenceAck ?? true) fd.append('low_confidence_ack', 'true');
	for (const l of lines) {
		fd.append('line_descriptions', l.desc);
		fd.append('line_quantities', '1');
		fd.append('line_units', l.unit);
		fd.append('line_unit_prices', l.price);
		fd.append('line_total_prices', l.price);
		fd.append('line_tax_rates', '');
	}
	return fd;
}

/**
 * A single-line-item saveReviewedInvoice form keyed by an opts bag rather
 * than positional args (tests/invoice-save-document-type,
 * tests/invoice-save-verifactu, tests/alert-preferences): every field but
 * `invoiceNumber` is optional, defaulting to values none of those suites'
 * assertions depend on. `lineDescription` exists only for callers that do
 * care what the line reads (alert-preferences) — everyone else gets the
 * placeholder default.
 */
export function singleLineInvoiceForm(opts: {
	invoiceNumber: string;
	supplier?: string;
	invoiceDate?: string;
	totalAmount?: string;
	lineDescription?: string;
}): FormData {
	const fd = new FormData();
	const totalAmount = opts.totalAmount ?? '100.00';
	fd.append('supplier_name', opts.supplier ?? '__inv_line_sup__');
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', opts.invoiceDate ?? '2024-01-15');
	fd.append('total_amount', totalAmount);
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', opts.lineDescription ?? 'Producto de prueba');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'ud');
	fd.append('line_unit_prices', totalAmount);
	fd.append('line_total_prices', totalAmount);
	fd.append('line_tax_rates', '');
	return fd;
}

/** A BatchItem whose only signal is a `document_type` (tests/alert-preferences,
 *  tests/invoice-save-duplicate-purchase — both drive the same "is this
 *  invoice a factura or an albarán" case fan-out). */
export function documentTypedItem(restaurantId: string, documentType: 'factura' | 'albaran' | null): BatchItem {
	return fakeBatchItem({ restaurantId, extractedData: { document_type: documentType, confidence: 1 } });
}

/** Casts a raw `extractedData` shape into the (much larger) BatchItem type
 *  saveReviewedInvoice actually expects — these suites only ever read
 *  `item.extractedData` back out of it. */
export function extractedItem(data: Record<string, unknown>): Parameters<typeof saveReviewedInvoice>[0] {
	return { extractedData: data } as unknown as Parameters<typeof saveReviewedInvoice>[0];
}

/**
 * Wraps saveReviewedInvoice with the assert-succeeded + extract-invoiceId
 * dance most DB-backed save tests repeat (asserted here so a helper that
 * only ever returns a number does not need every caller to first check
 * `out.type` for itself). Throws — rather than the bare
 * `if (out.type !== 'saved') return` early-exit some suites use inline —
 * so a failed save still fails the test loudly, exactly as the `expect`
 * right above it already would have.
 */
export async function saveInvoiceOrThrow(...args: Parameters<typeof saveReviewedInvoice>): Promise<number> {
	const out = await saveReviewedInvoice(...args);
	expect(out.type).toBe('saved');
	if (out.type !== 'saved') throw new Error(`expected a saved outcome, got ${out.type}`);
	return out.invoiceId;
}
