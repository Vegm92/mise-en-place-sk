/**
 * Emisor vs receptor assignment (issue #905, task 2).
 *
 * The reported failure: on a document that prints no emisor/cliente labels the
 * model assumed one party was the supplier, and picked the wrong one — so the
 * restaurant itself was written as a brand-new supplier while the real issuer,
 * already in the database, went unrecognised and unconfirmed.
 *
 * Extraction now reports both parties and the backend decides. The decision is
 * deterministic where it can be: a tax id equal to the restaurant's own is not
 * evidence about a supplier, it *is* the restaurant, so the pair is swapped.
 * Names are only the fallback for tenants that have not filled in their CIF/NIF
 * yet, and printed tax ids that do not match are believed over any name.
 *
 * The swap must also drop what belonged to the old emisor — contact details and
 * the category judged from its name — otherwise the correction would carry the
 * restaurant's own email onto a supplier row.
 */
import { describe, it, expect } from 'vitest';
import { resolveInvoiceParties } from '../src/lib/server/party';
import type { ExtractedInvoice } from '../src/lib/server/extract';

const OWN_NIF = '47306879L';

function invoice(overrides: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
	return {
		supplier_name: 'Clínica Dental Víctor Granda',
		supplier_nif: OWN_NIF,
		supplier_address: 'Calle Mayor 1, 07001 Palma',
		supplier_email: 'hola@clinica.example',
		supplier_phone: '+34 971 00 11 22',
		supplier_category: 'Material y Menaje',
		receiver_name: 'Elaboradental SL',
		receiver_nif: 'B99999997',
		receiver_address: 'Polígono Son Castelló 4, 07009 Palma',
		invoice_number: 'F-00998',
		document_type: 'factura',
		invoice_date: '2026-08-01',
		due_date: null,
		total_amount: 121,
		currency: 'EUR',
		tax_base: 100,
		tax_breakdown: null,
		confidence: 0.9,
		field_confidences: {
			supplier_name: 0.55,
			supplier_nif: 0.9,
			supplier_category: 0.7,
			receiver_name: 0.8,
			receiver_nif: 0.95,
		},
		line_items: [],
		...overrides,
	};
}

describe('resolveInvoiceParties — tax id', () => {
	it('swaps the parties when the document names the restaurant as the emisor', () => {
		const out = resolveInvoiceParties(invoice(), { taxId: OWN_NIF });
		expect(out.swapped).toBe(true);
		expect(out.reason).toBe('tax_id');
		expect(out.invoice.supplier_name).toBe('Elaboradental SL');
		expect(out.invoice.supplier_nif).toBe('B99999997');
		expect(out.invoice.supplier_address).toBe('Polígono Son Castelló 4, 07009 Palma');
		expect(out.invoice.receiver_name).toBe('Clínica Dental Víctor Granda');
		expect(out.invoice.receiver_nif).toBe(OWN_NIF);
	});

	it('matches the own tax id through separators and an ES prefix', () => {
		const out = resolveInvoiceParties(invoice(), { taxId: ' es 47.306.879-l ' });
		expect(out.swapped).toBe(true);
	});

	it('drops the old emisor contact details and category on a swap', () => {
		const out = resolveInvoiceParties(invoice(), { taxId: OWN_NIF });
		expect(out.invoice.supplier_email).toBeNull();
		expect(out.invoice.supplier_phone).toBeNull();
		expect(out.invoice.supplier_category).toBeNull();
		expect(out.invoice.field_confidences?.supplier_category).toBeUndefined();
	});

	it('carries the receiver confidences onto the supplier fields it becomes', () => {
		const out = resolveInvoiceParties(invoice(), { taxId: OWN_NIF });
		expect(out.invoice.field_confidences?.supplier_name).toBe(0.8);
		expect(out.invoice.field_confidences?.supplier_nif).toBe(0.95);
		expect(out.invoice.field_confidences?.receiver_name).toBe(0.55);
	});

	it('leaves a correctly read document untouched', () => {
		const correct = invoice({
			supplier_name: 'Elaboradental SL',
			supplier_nif: 'B99999997',
			receiver_name: 'Clínica Dental Víctor Granda',
			receiver_nif: OWN_NIF,
		});
		const out = resolveInvoiceParties(correct, { taxId: OWN_NIF });
		expect(out.swapped).toBe(false);
		expect(out.invoice).toBe(correct);
	});

	it('leaves a document that names neither party as this restaurant untouched', () => {
		const other = invoice({ supplier_nif: 'B99999997', receiver_nif: 'B99881120' });
		const out = resolveInvoiceParties(other, { taxId: OWN_NIF });
		expect(out.swapped).toBe(false);
	});
});

describe('resolveInvoiceParties — name fallback', () => {
	const noTaxIds = { supplier_nif: null, receiver_nif: null };

	it('swaps on a name match when the restaurant has no tax id on file', () => {
		const out = resolveInvoiceParties(
			invoice({ ...noTaxIds, supplier_name: 'Casa Lua SL', receiver_name: 'Elaboradental SL' }),
			{ names: ['Casa Lua'] },
		);
		expect(out.swapped).toBe(true);
		expect(out.reason).toBe('name');
		expect(out.invoice.supplier_name).toBe('Elaboradental SL');
	});

	it('matches the restaurant legal name as well as its display name', () => {
		const out = resolveInvoiceParties(
			invoice({ ...noTaxIds, supplier_name: 'Restauración Lua SLU', receiver_name: 'Elaboradental SL' }),
			{ names: ['Casa Lua', 'Restauración Lua'] },
		);
		expect(out.swapped).toBe(true);
	});

	it('does not swap when both parties match the restaurant name', () => {
		const out = resolveInvoiceParties(
			invoice({ ...noTaxIds, supplier_name: 'Casa Lua SL', receiver_name: 'Casa Lua' }),
			{ names: ['Casa Lua'] },
		);
		expect(out.swapped).toBe(false);
	});

	it('believes a printed tax id over a matching name', () => {
		const out = resolveInvoiceParties(
			invoice({ supplier_name: 'Casa Lua SL', supplier_nif: 'B99999997', receiver_nif: null }),
			{ taxId: OWN_NIF, names: ['Casa Lua'] },
		);
		expect(out.swapped).toBe(false);
	});

	it('falls back to names when the restaurant has a tax id but the document prints none', () => {
		const out = resolveInvoiceParties(
			invoice({ ...noTaxIds, supplier_name: 'Casa Lua SL', receiver_name: 'Elaboradental SL' }),
			{ taxId: OWN_NIF, names: ['Casa Lua'] },
		);
		expect(out.swapped).toBe(true);
		expect(out.reason).toBe('name');
	});
});

describe('resolveInvoiceParties — nothing to swap to', () => {
	it('never swaps a party in when the document printed no receiver', () => {
		const out = resolveInvoiceParties(
			invoice({ receiver_name: null, receiver_nif: null, receiver_address: null }),
			{ taxId: OWN_NIF, names: ['Clínica Dental Víctor Granda'] },
		);
		expect(out.swapped).toBe(false);
		expect(out.invoice.supplier_name).toBe('Clínica Dental Víctor Granda');
	});

	it('leaves the document alone when the restaurant has neither tax id nor names', () => {
		const out = resolveInvoiceParties(invoice(), {});
		expect(out.swapped).toBe(false);
	});
});
