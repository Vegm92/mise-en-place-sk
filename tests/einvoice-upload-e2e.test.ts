/**
 * End-to-end e-invoice intake (issue #111 reopened): upload -> classify -> extract.
 *
 * The 42 tests in einvoice-parser.test.ts call parseEinvoice(xmlString) directly
 * and never exercise the upload gate, so CI stayed green while `.xml` was
 * rejected before it ever reached the parser. This drives the real path:
 * saveUploadedFiles accepts the file, classifyFile/extractWithProvider parse it
 * with zero LLM usage, and totals/line items match the source exactly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { store } = vi.hoisted(() => ({ store: new Map<string, Buffer>() }));

vi.mock('../src/lib/server/storage', () => ({
	getStorage: () => ({
		save: async (key: string, buf: Buffer) => { store.set(key, buf); },
		read: async (key: string) => store.get(key),
		delete: async (key: string) => { store.delete(key); },
	}),
}));

import { saveUploadedFiles } from '../src/lib/server/sessions';
import { extractWithProvider } from '../src/lib/server/extract';

const FACTURAE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.es/Facturae/2014/v3.2.2/Facturae"
             xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <Parties>
    <SellerParty>
      <TaxIdentification><TaxIdentificationNumber>B12345678</TaxIdentificationNumber></TaxIdentification>
      <LegalEntity><CorporateName>Distribuciones Alimentarias S.L.</CorporateName></LegalEntity>
    </SellerParty>
  </Parties>
  <Invoices>
    <Invoice>
      <InvoiceHeader>
        <InvoiceNumber>001</InvoiceNumber>
        <InvoiceSeriesCode>FAC-2024</InvoiceSeriesCode>
      </InvoiceHeader>
      <InvoiceIssueData><IssueDate>2024-01-15</IssueDate></InvoiceIssueData>
      <InvoiceTotals>
        <TotalInvoiceAmount>1452.20</TotalInvoiceAmount>
      </InvoiceTotals>
      <Items>
        <InvoiceLine>
          <ItemDescription>Aceite de oliva virgen extra 5L</ItemDescription>
          <Quantity>10</Quantity>
          <UnitPriceWithoutTax>85.00</UnitPriceWithoutTax>
          <TotalCost>850.00</TotalCost>
        </InvoiceLine>
        <InvoiceLine>
          <ItemDescription>Sal marina fina 1kg</ItemDescription>
          <Quantity>20</Quantity>
          <UnitPriceWithoutTax>2.28</UnitPriceWithoutTax>
          <TotalCost>45.62</TotalCost>
        </InvoiceLine>
      </Items>
    </Invoice>
  </Invoices>
</fe:Facturae>`;

let dir: string;

beforeEach(() => {
	store.clear();
	dir = mkdtempSync(path.join(tmpdir(), 'mep-xml-'));
});

describe('saveUploadedFiles — accepts .xml e-invoices', () => {
	it('accepts a well-formed XML file', async () => {
		const file = new File([Buffer.from(FACTURAE_XML)], 'factura.xml');
		const { saved, errors } = await saveUploadedFiles([file], 'ns');
		expect(errors).toEqual([]);
		expect(saved).toHaveLength(1);
	});

	it('rejects a file with an .xml extension whose content is not XML', async () => {
		const file = new File([Buffer.from('not xml at all')], 'fake.xml');
		const { saved, errors } = await saveUploadedFiles([file], 'ns');
		expect(saved).toEqual([]);
		expect(errors[0]).toMatchObject({ name: 'fake.xml', reason: 'contentMismatch' });
	});
});

describe('upload -> classify -> extract (Facturae 3.2.2)', () => {
	it('imports a valid Facturae file with exact totals and line items, no LLM call', async () => {
		const fp = path.join(dir, 'factura.xml');
		writeFileSync(fp, FACTURAE_XML);

		const { invoice, usage } = await extractWithProvider(fp);

		expect(usage).toEqual({ inputTokens: 0, outputTokens: 0, model: 'xml-parser' });
		expect(invoice.total_amount).toBeCloseTo(1452.20, 2);
		expect(invoice.line_items).toHaveLength(2);
		expect(invoice.line_items[0]).toMatchObject({ quantity: 10, unit_price: 85.00 });
		expect(invoice.line_items[1]).toMatchObject({ quantity: 20, unit_price: 2.28 });

		rmSync(dir, { recursive: true, force: true });
	});

	it('surfaces a clear error for invalid/unrecognised XML', async () => {
		const fp = path.join(dir, 'bogus.xml');
		writeFileSync(fp, '<?xml version="1.0"?><NotAnInvoice/>');

		await expect(extractWithProvider(fp)).rejects.toThrow(/Unrecognised XML e-invoice format/);

		rmSync(dir, { recursive: true, force: true });
	});
});
