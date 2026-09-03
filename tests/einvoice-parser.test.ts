/**
 * Tests for structured e-invoice XML parsing (issue #111).
 * Covers Facturae 3.2.2 and UBL 2.1 (EN 16931).
 */
import { describe, it, expect } from 'vitest';
import {
	detectEinvoiceFormat,
	parseFacturae322,
	parseUbl21Invoice,
	parseEinvoice,
} from '../src/lib/server/einvoice-parser';

// issue #916 — shared by the Facturae and UBL "no discount/retention printed" cases below.
function expectNoTotalsChain(result: {
	gross_amount?: number | null;
	discount_amount?: number | null;
	retention_rate?: number | null;
	retention_amount?: number | null;
}) {
	expect(result.gross_amount).toBeNull();
	expect(result.discount_amount).toBeNull();
	expect(result.retention_rate).toBeNull();
	expect(result.retention_amount).toBeNull();
}

// ── Sample XML fixtures ───────────────────────────────────────────────────────

const FACTURAE_322_XML = `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.es/Facturae/2014/v3.2.2/Facturae"
             xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <FileHeader>
    <SchemaVersion>3.2.2</SchemaVersion>
    <Modality>I</Modality>
    <InvoiceIssuerType>EU</InvoiceIssuerType>
    <Batch>
      <BatchIdentifier>B12345678-FAC-2024-001</BatchIdentifier>
      <InvoicesCount>1</InvoicesCount>
      <TotalInvoicesAmount><TotalAmount>1452.20</TotalAmount></TotalInvoicesAmount>
      <TotalOutstandingAmount><TotalAmount>1452.20</TotalAmount></TotalOutstandingAmount>
      <TotalExecutableAmount><TotalAmount>1452.20</TotalAmount></TotalExecutableAmount>
      <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
    </Batch>
  </FileHeader>
  <Parties>
    <SellerParty>
      <TaxIdentification>
        <PersonTypeCode>J</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>B12345678</TaxIdentificationNumber>
      </TaxIdentification>
      <LegalEntity>
        <CorporateName>Distribuciones Alimentarias S.L.</CorporateName>
        <TradeName>DisAlim</TradeName>
        <RegistrationData>
          <RegisterOfRGME>12345</RegisterOfRGME>
        </RegistrationData>
        <AddressInSpain>
          <Address>Polígono Ind. La Resina, Nave 14</Address>
          <PostCode>28201</PostCode>
          <Town>Madrid</Town>
          <Province>Madrid</Province>
          <CountryCode>ESP</CountryCode>
        </AddressInSpain>
      </LegalEntity>
      <ContactDetails>
        <Telephone>+34915552233</Telephone>
        <ElectronicMail>facturacion@disalim.es</ElectronicMail>
      </ContactDetails>
    </SellerParty>
    <BuyerParty>
      <TaxIdentification>
        <PersonTypeCode>J</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>A98765432</TaxIdentificationNumber>
      </TaxIdentification>
      <LegalEntity>
        <CorporateName>Restaurante El Buen Sabor S.L.</CorporateName>
      </LegalEntity>
      <ContactDetails>
        <Telephone>+34911223344</Telephone>
        <ElectronicMail>restaurante@elbuensabor.es</ElectronicMail>
      </ContactDetails>
    </BuyerParty>
  </Parties>
  <Invoices>
    <Invoice>
      <InvoiceHeader>
        <InvoiceNumber>001</InvoiceNumber>
        <InvoiceSeriesCode>FAC-2024</InvoiceSeriesCode>
        <InvoiceDocumentType>FC</InvoiceDocumentType>
        <InvoiceClass>OO</InvoiceClass>
      </InvoiceHeader>
      <InvoiceIssueData>
        <IssueDate>2024-01-15</IssueDate>
        <InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>
        <TaxCurrencyCode>EUR</TaxCurrencyCode>
        <LanguageName>es</LanguageName>
      </InvoiceIssueData>
      <TaxesOutputs>
        <Tax>
          <TaxTypeCode>01</TaxTypeCode>
          <TaxRate>10.00</TaxRate>
          <TaxableBase>
            <TotalAmount>1050.00</TotalAmount>
            <EquivalentInEuros>1050.00</EquivalentInEuros>
          </TaxableBase>
          <TaxAmount>
            <TotalAmount>105.00</TotalAmount>
            <EquivalentInEuros>105.00</EquivalentInEuros>
          </TaxAmount>
        </Tax>
        <Tax>
          <TaxTypeCode>01</TaxTypeCode>
          <TaxRate>21.00</TaxRate>
          <TaxableBase>
            <TotalAmount>245.62</TotalAmount>
            <EquivalentInEuros>245.62</EquivalentInEuros>
          </TaxableBase>
          <TaxAmount>
            <TotalAmount>51.58</TotalAmount>
            <EquivalentInEuros>51.58</EquivalentInEuros>
          </TaxAmount>
        </Tax>
      </TaxesOutputs>
      <InvoiceTotals>
        <TotalGrossAmount>1295.62</TotalGrossAmount>
        <TotalGeneralDiscounts>0.00</TotalGeneralDiscounts>
        <TotalGeneralSurcharges>0.00</TotalGeneralSurcharges>
        <TotalGrossAmountBeforeTaxes>1295.62</TotalGrossAmountBeforeTaxes>
        <TotalTaxOutputs>156.58</TotalTaxOutputs>
        <TotalTaxesWithheld>0.00</TotalTaxesWithheld>
        <InvoiceTotal>1452.20</InvoiceTotal>
        <TotalOutstandingAmount>1452.20</TotalOutstandingAmount>
        <TotalExecutableAmount>1452.20</TotalExecutableAmount>
        <TotalInvoiceAmount>1452.20</TotalInvoiceAmount>
      </InvoiceTotals>
      <Items>
        <InvoiceLine>
          <ItemDescription>Aceite de oliva virgen extra 5L</ItemDescription>
          <Quantity>10</Quantity>
          <UnitOfMeasure>04</UnitOfMeasure>
          <UnitPriceWithoutTax>85.00</UnitPriceWithoutTax>
          <TotalCost>850.00</TotalCost>
          <GrossAmount>850.00</GrossAmount>
        </InvoiceLine>
        <InvoiceLine>
          <ItemDescription>Sal marina fina 1kg</ItemDescription>
          <Quantity>20</Quantity>
          <UnitOfMeasure>03</UnitOfMeasure>
          <UnitPriceWithoutTax>2.28</UnitPriceWithoutTax>
          <TotalCost>45.62</TotalCost>
          <GrossAmount>45.62</GrossAmount>
        </InvoiceLine>
      </Items>
      <AdditionalData>
        <RelatedDocuments>
          <ReceiverTransactionReference>PO-2024-778</ReceiverTransactionReference>
        </RelatedDocuments>
      </AdditionalData>
    </Invoice>
  </Invoices>
</fe:Facturae>`;

const UBL_21_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>2024-UBL-0042</cbc:ID>
  <cbc:IssueDate>2024-03-20</cbc:IssueDate>
  <cbc:DueDate>2024-04-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:Note>Entregar en muelle de carga trasero</cbc:Note>
  <cac:OrderReference>
    <cbc:ID>PO-UBL-9001</cbc:ID>
  </cac:OrderReference>
  <cac:Delivery>
    <cbc:ActualDeliveryDate>2024-03-19</cbc:ActualDeliveryDate>
    <cac:DeliveryLocation>
      <cac:Address>
        <cbc:StreetName>Polígono Cantabria, Nave 3</cbc:StreetName>
        <cbc:CityName>Logroño</cbc:CityName>
        <cbc:PostalZone>26007</cbc:PostalZone>
      </cac:Address>
    </cac:DeliveryLocation>
  </cac:Delivery>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>Bodega La Rioja Alta S.A.</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Camino de Salcedo, 1</cbc:StreetName>
        <cbc:CityName>Haro</cbc:CityName>
        <cbc:PostalZone>26200</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>ES</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>A26000421</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Bodega La Rioja Alta S.A.</cbc:RegistrationName>
        <cbc:CompanyID>A26000421</cbc:CompanyID>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>+34941310000</cbc:Telephone>
        <cbc:ElectronicMail>ventas@riojaalta.es</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>B98765432</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone>+34911223344</cbc:Telephone>
        <cbc:ElectronicMail>restaurante@elbuensabor.es</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">52.50</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">250.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">52.50</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>21</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">250.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">250.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">302.50</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">302.50</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="BTL">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">250.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>Rioja Alta Gran Reserva 2016</cbc:Description>
      <cbc:Name>Rioja Alta Gran Reserva</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">25.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

// ── detectEinvoiceFormat ──────────────────────────────────────────────────────

describe('detectEinvoiceFormat', () => {
	it('detects Facturae 3.2.2 by namespace', () => {
		expect(detectEinvoiceFormat(FACTURAE_322_XML)).toBe('facturae_322');
	});

	it('detects UBL 2.1 by namespace', () => {
		expect(detectEinvoiceFormat(UBL_21_XML)).toBe('ubl_21');
	});

	it('returns null for unrecognised XML', () => {
		expect(detectEinvoiceFormat('<root><data>hello</data></root>')).toBeNull();
	});

	it('detects Facturae by version-agnostic namespace substring', () => {
		const xml = `<Facturae xmlns="http://www.facturae.es/Facturae/2009/v3.2.1/Facturae"></Facturae>`;
		expect(detectEinvoiceFormat(xml)).toBe('facturae_322');
	});
});

// ── parseFacturae322 ──────────────────────────────────────────────────────────

describe('parseFacturae322', () => {
	it('extracts supplier name', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.supplier_name).toBe('Distribuciones Alimentarias S.L.');
	});

	it('extracts supplier NIF', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.supplier_nif).toBe('B12345678');
	});

	it('extracts supplier address from AddressInSpain (issue #385)', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.supplier_address).toBe('Polígono Ind. La Resina, Nave 14, 28201, Madrid');
	});

	it('extracts the buyer party as the receiver (issue #905)', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.receiver_name).toBe('Restaurante El Buen Sabor S.L.');
		expect(result.receiver_nif).toBe('A98765432');
	});

	it('scores both parties in field_confidences so a swap can carry them (issue #905)', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.field_confidences?.supplier_nif).toBe(1.0);
		expect(result.field_confidences?.receiver_name).toBe(1.0);
		expect(result.field_confidences?.receiver_nif).toBe(1.0);
	});

	it('extracts supplier and receiver email/phone from ContactDetails (issues #385, #918)', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.supplier_email).toBe('facturacion@disalim.es');
		expect(result.supplier_phone).toBe('+34915552233');
		expect(result.receiver_email).toBe('restaurante@elbuensabor.es');
		expect(result.receiver_phone).toBe('+34911223344');
	});

	it('yields null contact fields when ContactDetails/AddressInSpain are absent', () => {
		const xmlNoContact = FACTURAE_322_XML
			.replace(/<AddressInSpain>[\s\S]*?<\/AddressInSpain>/, '')
			.replace(/<ContactDetails>[\s\S]*?<\/ContactDetails>/, '');
		const result = parseFacturae322(xmlNoContact);
		expect(result.supplier_address).toBeNull();
		expect(result.supplier_email).toBeNull();
		expect(result.supplier_phone).toBeNull();
	});

	it('yields null receiver contact fields when the BuyerParty prints none (issue #918)', () => {
		const xmlNoBuyerContact = FACTURAE_322_XML.replace(
			/<ContactDetails>\s*<Telephone>\+34911223344<\/Telephone>[\s\S]*?<\/ContactDetails>/, '',
		);
		const result = parseFacturae322(xmlNoBuyerContact);
		expect(result.receiver_email).toBeNull();
		expect(result.receiver_phone).toBeNull();
		expect(result.supplier_email).toBe('facturacion@disalim.es');
	});

	it('extracts invoice number with series code', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.invoice_number).toBe('FAC-2024-001');
	});

	it('extracts purchase_order from AdditionalData/RelatedDocuments/ReceiverTransactionReference', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.purchase_order).toBe('PO-2024-778');
	});

	it('yields null purchase_order/seller_name/delivery_date/delivery_address/printed_notes when AdditionalData is absent', () => {
		const xmlNoAdditionalData = FACTURAE_322_XML.replace(/<AdditionalData>[\s\S]*?<\/AdditionalData>/, '');
		const result = parseFacturae322(xmlNoAdditionalData);
		expect(result).toMatchObject({
			purchase_order: null, seller_name: null, delivery_date: null, delivery_address: null, printed_notes: null,
		});
	});

	it('extracts invoice date', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.invoice_date).toBe('2024-01-15');
	});

	it('extracts total amount', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.total_amount).toBeCloseTo(1452.20, 2);
	});

	it('extracts tax breakdown with two rates', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.tax_breakdown).not.toBeNull();
		expect(result.tax_breakdown).toHaveLength(2);

		const rates = result.tax_breakdown!.map(t => t.rate).sort();
		expect(rates[0]).toBeCloseTo(0.10, 5);
		expect(rates[1]).toBeCloseTo(0.21, 5);
	});

	it('extracts line items', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.line_items).toHaveLength(2);
		expect(result.line_items[0].description).toBe('Aceite de oliva virgen extra 5L');
		expect(result.line_items[0].quantity).toBe(10);
		expect(result.line_items[0].unit).toBe('L'); // UoM 04 (Litros) → L
		expect(result.line_items[0].unit_price).toBeCloseTo(85.0, 2);
		expect(result.line_items[0].total_price).toBeCloseTo(850.0, 2);
	});

	it('maps unit code 03 (Kilogramos) to kg', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.line_items[1].unit).toBe('kg');
	});

	it('maps the container/measure codes of the official Facturae table', () => {
		// 06 Cajas, 18 Docenas, 20 Garrafas, 21 Gramos, 23 Latas
		const cases: Array<[string, string]> = [
			['06', 'caja'], ['18', 'docena'], ['20', 'garrafa'], ['21', 'g'], ['23', 'lata'],
		];
		for (const [code, expected] of cases) {
			const xml = FACTURAE_322_XML.replace('<UnitOfMeasure>04</UnitOfMeasure>', `<UnitOfMeasure>${code}</UnitOfMeasure>`);
			expect(parseFacturae322(xml).line_items[0].unit, `code ${code}`).toBe(expected);
		}
	});

	it('yields null unit for code 05 (Otros) instead of a fake unit', () => {
		const xml = FACTURAE_322_XML.replace('<UnitOfMeasure>04</UnitOfMeasure>', '<UnitOfMeasure>05</UnitOfMeasure>');
		expect(parseFacturae322(xml).line_items[0].unit).toBeNull();
	});

	it('extracts per-line tax_rate from InvoiceLine/TaxesOutputs/Tax/TaxRate (issue #919)', () => {
		const xml = FACTURAE_322_XML.replace(
			'<ItemDescription>Aceite de oliva virgen extra 5L</ItemDescription>',
			`<ItemDescription>Aceite de oliva virgen extra 5L</ItemDescription>
			<TaxesOutputs>
				<Tax>
					<TaxTypeCode>01</TaxTypeCode>
					<TaxRate>10.00</TaxRate>
				</Tax>
			</TaxesOutputs>`,
		);
		const result = parseFacturae322(xml);
		expect(result.line_items[0].tax_rate).toBeCloseTo(0.10, 5);
	});

	it('yields null line tax_rate when the line prints no TaxesOutputs (issue #919)', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.line_items[0].tax_rate).toBeNull();
		expect(result.line_items[1].tax_rate).toBeNull();
	});

	it('sets confidence to 1.0 for all fields', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.confidence).toBe(1.0);
		expect(result.field_confidences?.supplier_name).toBe(1.0);
		expect(result.field_confidences?.invoice_number).toBe(1.0);
		expect(result.field_confidences?.invoice_date).toBe(1.0);
		expect(result.field_confidences?.total_amount).toBe(1.0);
	});

	it('sets e_invoice_format to facturae_322', () => {
		expect(parseFacturae322(FACTURAE_322_XML).e_invoice_format).toBe('facturae_322');
	});

	it('sets document_type to factura with full confidence (issue #461)', () => {
		const result = parseFacturae322(FACTURAE_322_XML);
		expect(result.document_type).toBe('factura');
		expect(result.field_confidences?.document_type).toBe(1.0);
	});

	it('sets currency to EUR', () => {
		expect(parseFacturae322(FACTURAE_322_XML).currency).toBe('EUR');
	});

	it('leaves gross_amount/discount_amount/retention null when the totals carry no discount or withholding (issue #916)', () => {
		expectNoTotalsChain(parseFacturae322(FACTURAE_322_XML));
	});

	it('extracts TotalGeneralDiscounts as discount_amount and derives tax_base as gross minus discount (issue #916)', () => {
		const xml = FACTURAE_322_XML
			.replace('<TotalGrossAmount>1295.62</TotalGrossAmount>', '<TotalGrossAmount>1345.62</TotalGrossAmount>')
			.replace('<TotalGeneralDiscounts>0.00</TotalGeneralDiscounts>', '<TotalGeneralDiscounts>50.00</TotalGeneralDiscounts>');
		const result = parseFacturae322(xml);
		expect(result.gross_amount).toBeCloseTo(1345.62, 2);
		expect(result.discount_amount).toBeCloseTo(50.00, 2);
		expect(result.tax_base).toBeCloseTo(1295.62, 2);
	});

	it('extracts TaxesWithheld/Tax as retention_rate and retention_amount (issue #916)', () => {
		const xml = FACTURAE_322_XML.replace(
			'</TaxesOutputs>',
			`</TaxesOutputs>
			<TaxesWithheld>
				<Tax>
					<TaxTypeCode>04</TaxTypeCode>
					<TaxRate>15.00</TaxRate>
					<TaxableBase><TotalAmount>1295.62</TotalAmount></TaxableBase>
					<TaxAmount><TotalAmount>194.34</TotalAmount></TaxAmount>
				</Tax>
			</TaxesWithheld>`,
		);
		const result = parseFacturae322(xml);
		expect(result.retention_rate).toBeCloseTo(0.15, 5);
		expect(result.retention_amount).toBeCloseTo(194.34, 2);
	});
});

// ── parseUbl21Invoice ─────────────────────────────────────────────────────────

describe('parseUbl21Invoice', () => {
	it('extracts supplier name', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.supplier_name).toBe('Bodega La Rioja Alta S.A.');
	});

	it('extracts supplier NIF from PartyTaxScheme', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.supplier_nif).toBe('A26000421');
	});

	it('extracts supplier address from PostalAddress (issue #385)', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.supplier_address).toBe('Camino de Salcedo, 1, Haro, 26200');
	});

	it('extracts the customer party as the receiver, null-safe when it prints no name (issue #905)', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.receiver_nif).toBe('B98765432');
		expect(result.receiver_name).toBeNull();
		expect(result.receiver_address).toBeNull();
	});

	it('extracts supplier and receiver email/phone from Contact (issues #385, #918)', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.supplier_email).toBe('ventas@riojaalta.es');
		expect(result.supplier_phone).toBe('+34941310000');
		expect(result.receiver_email).toBe('restaurante@elbuensabor.es');
		expect(result.receiver_phone).toBe('+34911223344');
	});

	it('yields null contact fields when PostalAddress/Contact are absent', () => {
		const xmlNoContact = UBL_21_XML
			.replace(/<cac:PostalAddress>[\s\S]*?<\/cac:PostalAddress>/, '')
			.replace(/<cac:Contact>[\s\S]*?<\/cac:Contact>/, '');
		const result = parseUbl21Invoice(xmlNoContact);
		expect(result.supplier_address).toBeNull();
		expect(result.supplier_email).toBeNull();
		expect(result.supplier_phone).toBeNull();
	});

	it('yields null receiver contact fields when the customer party prints none (issue #918)', () => {
		const xmlNoCustomerContact = UBL_21_XML.replace(
			/<cac:Contact>\s*<cbc:Telephone>\+34911223344<\/cbc:Telephone>[\s\S]*?<\/cac:Contact>/, '',
		);
		const result = parseUbl21Invoice(xmlNoCustomerContact);
		expect(result.receiver_email).toBeNull();
		expect(result.receiver_phone).toBeNull();
		expect(result.supplier_email).toBe('ventas@riojaalta.es');
	});

	it('extracts invoice number (ID)', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.invoice_number).toBe('2024-UBL-0042');
	});

	it('extracts purchase_order from OrderReference/ID', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.purchase_order).toBe('PO-UBL-9001');
	});

	it('extracts delivery_date and delivery_address from Delivery', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.delivery_date).toBe('2024-03-19');
		expect(result.delivery_address).toBe('Polígono Cantabria, Nave 3, Logroño, 26007');
	});

	it('extracts printed_notes from Note', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.printed_notes).toBe('Entregar en muelle de carga trasero');
	});

	it('yields null purchase_order/delivery fields when OrderReference/Delivery/Note are absent', () => {
		const xmlBare = UBL_21_XML
			.replace(/<cbc:Note>[\s\S]*?<\/cbc:Note>/, '')
			.replace(/<cac:OrderReference>[\s\S]*?<\/cac:OrderReference>/, '')
			.replace(/<cac:Delivery>[\s\S]*?<\/cac:Delivery>/, '');
		const result = parseUbl21Invoice(xmlBare);
		expect(result).toMatchObject({
			purchase_order: null, delivery_date: null, delivery_address: null, printed_notes: null,
		});
	});

	it('extracts issue date', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.invoice_date).toBe('2024-03-20');
	});

	it('extracts due date', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.due_date).toBe('2024-04-20');
	});

	it('extracts total amount from PayableAmount', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.total_amount).toBeCloseTo(302.50, 2);
	});

	it('extracts tax base from TaxExclusiveAmount', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.tax_base).toBeCloseTo(250.00, 2);
	});

	it('extracts tax breakdown', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.tax_breakdown).not.toBeNull();
		expect(result.tax_breakdown).toHaveLength(1);
		expect(result.tax_breakdown![0].rate).toBeCloseTo(0.21, 5);
		expect(result.tax_breakdown![0].base).toBeCloseTo(250.00, 2);
		expect(result.tax_breakdown![0].tax_amount).toBeCloseTo(52.50, 2);
	});

	it('extracts line items', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.line_items).toHaveLength(1);
		expect(result.line_items[0].description).toBe('Rioja Alta Gran Reserva 2016');
		expect(result.line_items[0].quantity).toBe(10);
		expect(result.line_items[0].unit).toBe('botella'); // unitCode BTL → botella
		expect(result.line_items[0].unit_price).toBeCloseTo(25.00, 2);
		expect(result.line_items[0].total_price).toBeCloseTo(250.00, 2);
	});

	it('maps UN/ECE unit codes to canonical units', () => {
		const cases: Array<[string, string]> = [
			['KGM', 'kg'], ['GRM', 'g'], ['LTR', 'L'], ['MLT', 'ml'],
			['C62', 'ud'], ['EA', 'ud'], ['XBX', 'caja'], ['DZN', 'docena'],
		];
		for (const [code, expected] of cases) {
			const xml = UBL_21_XML.replace('unitCode="BTL"', `unitCode="${code}"`);
			expect(parseUbl21Invoice(xml).line_items[0].unit, `unitCode ${code}`).toBe(expected);
		}
	});

	it('yields null unit for an unknown unitCode instead of the raw code', () => {
		const xml = UBL_21_XML.replace('unitCode="BTL"', 'unitCode="ZZ9"');
		expect(parseUbl21Invoice(xml).line_items[0].unit).toBeNull();
	});

	it('extracts per-line tax_rate from InvoiceLine/Item/ClassifiedTaxCategory/Percent (issue #919)', () => {
		const xml = UBL_21_XML.replace(
			'</cac:Item>',
			`<cac:ClassifiedTaxCategory>
				<cbc:Percent>21</cbc:Percent>
			</cac:ClassifiedTaxCategory>
			</cac:Item>`,
		);
		const result = parseUbl21Invoice(xml);
		expect(result.line_items[0].tax_rate).toBeCloseTo(0.21, 5);
	});

	it('yields null line tax_rate when the line prints no ClassifiedTaxCategory (issue #919)', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.line_items[0].tax_rate).toBeNull();
	});

	it('sets confidence to 1.0', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.confidence).toBe(1.0);
	});

	it('sets e_invoice_format to ubl_21', () => {
		expect(parseUbl21Invoice(UBL_21_XML).e_invoice_format).toBe('ubl_21');
	});

	it('sets document_type to factura with full confidence (issue #461)', () => {
		const result = parseUbl21Invoice(UBL_21_XML);
		expect(result.document_type).toBe('factura');
		expect(result.field_confidences?.document_type).toBe(1.0);
	});

	it('leaves gross_amount/discount_amount/retention null when there is no AllowanceCharge or WithholdingTaxTotal (issue #916)', () => {
		expectNoTotalsChain(parseUbl21Invoice(UBL_21_XML));
	});

	it('extracts an AllowanceCharge with ChargeIndicator=false as a discount (issue #916)', () => {
		const xml = UBL_21_XML.replace(
			'<cac:LegalMonetaryTotal>',
			`<cac:AllowanceCharge>
				<cbc:ChargeIndicator>false</cbc:ChargeIndicator>
				<cbc:AllowanceChargeReason>Dto. pronto pago</cbc:AllowanceChargeReason>
				<cbc:Amount currencyID="EUR">12.50</cbc:Amount>
			</cac:AllowanceCharge>
			<cac:LegalMonetaryTotal>`,
		);
		const result = parseUbl21Invoice(xml);
		expect(result.discount_amount).toBeCloseTo(12.50, 2);
		expect(result.gross_amount).toBeCloseTo(250.00, 2);
	});

	it('ignores an AllowanceCharge with ChargeIndicator=true (a surcharge, not a discount) (issue #916)', () => {
		const xml = UBL_21_XML.replace(
			'<cac:LegalMonetaryTotal>',
			`<cac:AllowanceCharge>
				<cbc:ChargeIndicator>true</cbc:ChargeIndicator>
				<cbc:Amount currencyID="EUR">5.00</cbc:Amount>
			</cac:AllowanceCharge>
			<cac:LegalMonetaryTotal>`,
		);
		const result = parseUbl21Invoice(xml);
		expect(result.discount_amount).toBeNull();
		expect(result.gross_amount).toBeNull();
	});

	it('extracts a WithholdingTaxTotal as retention_rate and retention_amount (issue #916)', () => {
		const xml = UBL_21_XML.replace(
			'<cac:LegalMonetaryTotal>',
			`<cac:WithholdingTaxTotal>
				<cbc:TaxAmount currencyID="EUR">37.50</cbc:TaxAmount>
				<cac:TaxSubtotal>
					<cbc:TaxableAmount currencyID="EUR">250.00</cbc:TaxableAmount>
					<cbc:TaxAmount currencyID="EUR">37.50</cbc:TaxAmount>
					<cac:TaxCategory>
						<cbc:Percent>15</cbc:Percent>
					</cac:TaxCategory>
				</cac:TaxSubtotal>
			</cac:WithholdingTaxTotal>
			<cac:LegalMonetaryTotal>`,
		);
		const result = parseUbl21Invoice(xml);
		expect(result.retention_rate).toBeCloseTo(0.15, 5);
		expect(result.retention_amount).toBeCloseTo(37.50, 2);
	});
});

// ── parseEinvoice (auto-dispatch) ─────────────────────────────────────────────

describe('parseEinvoice', () => {
	it('auto-dispatches to Facturae parser', () => {
		const result = parseEinvoice(FACTURAE_322_XML);
		expect(result).not.toBeNull();
		expect(result?.e_invoice_format).toBe('facturae_322');
	});

	it('auto-dispatches to UBL 2.1 parser', () => {
		const result = parseEinvoice(UBL_21_XML);
		expect(result).not.toBeNull();
		expect(result?.e_invoice_format).toBe('ubl_21');
	});

	it('returns null for unrecognised XML', () => {
		expect(parseEinvoice('<root><unknown/></root>')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseEinvoice('')).toBeNull();
	});
});
