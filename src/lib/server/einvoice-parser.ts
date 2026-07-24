/**
 * Structured e-invoice parser for Facturae 3.2.x and UBL 2.1 (EN 16931).
 *
 * When an XML invoice is uploaded the entire Gemini extraction step is skipped —
 * the fields arrive structured with confidence 1.0.
 *
 * Supported formats:
 *   Facturae 3.2.2  — Spain national format (B2G via FACe, also B2B private)
 *   UBL 2.1         — EU standard (EN 16931, mandatory for Spain's SPFE public platform)
 */
import { XMLParser } from 'fast-xml-parser';
import { canonicalizeUnit } from './normalize';
import type { ExtractedInvoice } from './extract';

export type EinvoiceFormat = 'facturae_322' | 'ubl_21';

const FACTURAE_NS_SUBSTRINGS = [
	'http://www.facturae.es/Facturae/',
	'http://www.facturae.gob.es/formato/',
	'Facturae/2014/v3.2.2',
	'Facturae/2009/v3.2.1',
	'Facturae/2014/v3.2',
];

const UBL_INVOICE_NS = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';

export function detectEinvoiceFormat(xml: string): EinvoiceFormat | null {
	if (FACTURAE_NS_SUBSTRINGS.some((s) => xml.includes(s))) return 'facturae_322';
	if (xml.includes(UBL_INVOICE_NS)) return 'ubl_21';
	return null;
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	removeNSPrefix: true,
	parseAttributeValue: false, // keep attribute values as strings
	parseTagValue: true,        // parse numeric element values
	// 'Invoice' intentionally omitted: it's the UBL root element (always singular)
	// and appears as a Facturae child only inside <Invoices> — handled by getArr().
	isArray: (name) =>
		['InvoiceLine', 'Tax', 'TaxSubtotal', 'TaxTotal', 'AllowanceCharge'].includes(name),
	numberParseOptions: { leadingZeros: true, hex: false, skipLike: /^0\d/ },
});

// ── Generic helpers ───────────────────────────────────────────────────────────

function getChild(obj: unknown, ...keys: string[]): unknown {
	let cur: unknown = obj;
	for (const key of keys) {
		if (cur === null || cur === undefined) return undefined;
		if (typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[key];
	}
	return cur;
}

function getText(node: unknown): string | null {
	if (node === null || node === undefined) return null;
	if (typeof node === 'string') return node.trim() || null;
	if (typeof node === 'number' || typeof node === 'boolean') return String(node);
	if (typeof node === 'object') {
		const obj = node as Record<string, unknown>;
		if ('#text' in obj) return getText(obj['#text']);
	}
	return null;
}

function getNum(node: unknown): number | null {
	if (typeof node === 'number') return node;
	const t = getText(node);
	if (!t) return null;
	const n = parseFloat(t.replace(',', '.'));
	return isNaN(n) ? null : n;
}

function getArr(obj: unknown, key: string): unknown[] {
	const val = (obj as Record<string, unknown>)?.[key];
	if (!val) return [];
	return Array.isArray(val) ? val : [val];
}

// ── Facturae 3.2.x ───────────────────────────────────────────────────────────

// Facturae 3.2.x UnitOfMeasureType, complete per the official spec (issue #297):
// 01 Unidades, 02 Horas, 03 Kilogramos, 04 Litros, 05 Otros, 06 Cajas,
// 07 Bandejas, 08 Barriles, 09 Bidones, 10 Bolsas, 11 Bombonas, 12 Botellas,
// 13 Botes, 14 TetraBriks, 15 Centilitros, 16 Centímetros, 17 Cubetas,
// 18 Docenas, 19 Estuches, 20 Garrafas, 21 Gramos, 22 Kilómetros, 23 Latas,
// 24 Manojos, 25 Metros, 26 Milímetros, 27 Packs de 6, 28 Paquetes,
// 29 Raciones, 30 Rollos, 31 Sobres, 32 Tarrinas, 33 m³, 34 Segundos,
// 35 Vatios, 36 kWh. The previous map here ('02'→kg, '03'→L, …) did not match
// the spec and mislabeled units on every real Facturae invoice.
// null = no food-relevant canonical unit; leave the line unit empty rather
// than inventing one.
const FACTURAE_UNIT_CODES: Record<string, string | null> = {
	'01': 'ud',      '02': 'hora',    '03': 'kg',      '04': 'L',       '05': null,
	'06': 'caja',    '07': 'bandeja', '08': 'barril',  '09': 'bidón',   '10': 'bolsa',
	'11': 'bombona', '12': 'botella', '13': 'bote',    '14': 'brik',    '15': 'cl',
	'16': 'cm',      '17': 'cubeta',  '18': 'docena',  '19': 'estuche', '20': 'garrafa',
	'21': 'g',       '22': 'km',      '23': 'lata',    '24': 'manojo',  '25': 'm',
	'26': 'mm',      '27': 'pack',    '28': 'paquete', '29': 'ración',  '30': 'rollo',
	'31': 'sobre',   '32': 'tarrina', '33': 'm3',      '34': null,      '35': null,
	'36': 'kWh',
};

export function parseFacturae322(xml: string): ExtractedInvoice & { e_invoice_format: EinvoiceFormat; supplier_nif: string | null } {
	const doc = parser.parse(xml) as Record<string, unknown>;

	// Root element may be prefixed (namespace removed) or plain 'Facturae'
	const root = (doc['Facturae'] ?? Object.values(doc)[0]) as Record<string, unknown>;

	const parties = root['Parties'] as Record<string, unknown> | undefined;
	const seller = (parties?.['SellerParty'] ?? {}) as Record<string, unknown>;

	const nif = getText(getChild(seller, 'TaxIdentification', 'TaxIdentificationNumber'));
	const supplierName =
		getText(getChild(seller, 'LegalEntity', 'CorporateName')) ??
		getText(getChild(seller, 'Individual', 'Name'));

	const invoicesNode = root['Invoices'] as Record<string, unknown> | undefined;
	const invoices = getArr(invoicesNode, 'Invoice');
	const invoice = (invoices[0] ?? {}) as Record<string, unknown>;

	const header = (invoice['InvoiceHeader'] ?? {}) as Record<string, unknown>;
	const invoiceNumber = getText(header['InvoiceNumber']);
	const seriesCode = getText(header['InvoiceSeriesCode']);
	const fullNumber = seriesCode ? `${seriesCode}-${invoiceNumber}` : (invoiceNumber ?? null);

	const issueData = (invoice['InvoiceIssueData'] ?? {}) as Record<string, unknown>;
	const invoiceDate = getText(issueData['IssueDate']);
	const currency = getText(issueData['InvoiceCurrencyCode']) ?? 'EUR';

	const totals = (invoice['InvoiceTotals'] ?? {}) as Record<string, unknown>;
	const totalAmount =
		getNum(totals['TotalInvoiceAmount']) ??
		getNum(totals['TotalExecutableAmount']);
	const taxBase = getNum(totals['TotalGrossAmount']);

	const taxesOutputs = invoice['TaxesOutputs'] as Record<string, unknown> | undefined;
	const taxes = getArr(taxesOutputs, 'Tax');
	const taxBreakdown = taxes.length
		? taxes.map((tax) => ({
			rate: (getNum(getChild(tax, 'TaxRate')) ?? 0) / 100,
			base: getNum(getChild(tax, 'TaxableBase', 'TotalAmount')) ?? 0,
			tax_amount: getNum(getChild(tax, 'TaxAmount', 'TotalAmount')) ?? 0,
		}))
		: null;

	const items = invoice['Items'] as Record<string, unknown> | undefined;
	const lines = getArr(items, 'InvoiceLine');
	const line_items = lines.map((line) => {
		const uom = getText(getChild(line, 'UnitOfMeasure'));
		return {
			description: getText(getChild(line, 'ItemDescription')) ?? '',
			quantity: getNum(getChild(line, 'Quantity')),
			// Numeric spec code → canonical unit; some issuers put literal text
			// ("kg") in UnitOfMeasure — canonicalizeUnit covers those. Unknown
			// codes yield null (flagged for conversion) instead of a fake unit.
			unit: (uom ? (FACTURAE_UNIT_CODES[uom] ?? canonicalizeUnit(uom)) : null),
			unit_price: getNum(getChild(line, 'UnitPriceWithoutTax')),
			total_price: getNum(getChild(line, 'TotalCost')) ?? getNum(getChild(line, 'GrossAmount')),
			confidence: 1.0,
		};
	});

	return {
		supplier_name: supplierName,
		supplier_nif: nif,
		invoice_number: fullNumber,
		invoice_date: invoiceDate,
		due_date: null, // Facturae payment terms live in PaymentDetails, omit for Phase 1
		total_amount: totalAmount,
		currency,
		tax_base: taxBase,
		tax_breakdown: taxBreakdown,
		confidence: 1.0,
		field_confidences: {
			supplier_name: supplierName ? 1.0 : 0,
			invoice_number: fullNumber ? 1.0 : 0,
			invoice_date: invoiceDate ? 1.0 : 0,
			total_amount: totalAmount != null ? 1.0 : 0,
		},
		line_items,
		e_invoice_format: 'facturae_322',
	};
}

// ── UBL 2.1 ──────────────────────────────────────────────────────────────────

export function parseUbl21Invoice(xml: string): ExtractedInvoice & { e_invoice_format: EinvoiceFormat; supplier_nif: string | null } {
	const doc = parser.parse(xml) as Record<string, unknown>;
	const inv = (doc['Invoice'] ?? Object.values(doc)[0]) as Record<string, unknown>;

	const supplierParty = getChild(inv, 'AccountingSupplierParty', 'Party') as Record<string, unknown> | undefined;

	const supplierName =
		getText(getChild(supplierParty, 'PartyName', 'Name')) ??
		getText(getChild(supplierParty, 'PartyLegalEntity', 'RegistrationName'));

	// Spanish NIF can be in PartyTaxScheme/CompanyID or PartyLegalEntity/CompanyID
	const nif =
		getText(getChild(supplierParty, 'PartyTaxScheme', 'CompanyID')) ??
		getText(getChild(supplierParty, 'PartyLegalEntity', 'CompanyID'));

	const invoiceNumber = getText(inv['ID']);
	const invoiceDate = getText(inv['IssueDate']);
	const dueDate = getText(inv['DueDate']);

	const totals = inv['LegalMonetaryTotal'] as Record<string, unknown> | undefined;
	const totalAmount =
		getNum(getChild(totals, 'PayableAmount')) ??
		getNum(getChild(totals, 'TaxInclusiveAmount'));
	const taxBase =
		getNum(getChild(totals, 'TaxExclusiveAmount')) ??
		getNum(getChild(totals, 'LineExtensionAmount'));

	const payableNode = getChild(totals, 'PayableAmount') as Record<string, unknown> | undefined;
	const currency = (payableNode?.['@_currencyID'] as string | undefined) ?? 'EUR';

	const taxTotals = getArr(inv, 'TaxTotal');
	const firstTaxTotal = taxTotals[0] as Record<string, unknown> | undefined;
	const subtotals = getArr(firstTaxTotal, 'TaxSubtotal');
	const taxBreakdown = subtotals.length
		? subtotals.map((sub) => ({
			rate: (getNum(getChild(sub, 'TaxCategory', 'Percent')) ?? 0) / 100,
			base: getNum(getChild(sub, 'TaxableAmount')) ?? 0,
			tax_amount: getNum(getChild(sub, 'TaxAmount')) ?? 0,
		}))
		: null;

	const lineNodes = getArr(inv, 'InvoiceLine');
	const line_items = lineNodes.map((line) => {
		const desc =
			getText(getChild(line, 'Item', 'Description')) ??
			getText(getChild(line, 'Item', 'Name')) ??
			'';
		const qty = getNum(getChild(line, 'InvoicedQuantity'));
		const unitCodeRaw = (getChild(line, 'InvoicedQuantity') as Record<string, unknown> | undefined)?.['@_unitCode'];
		// UN/ECE Rec 20/21 codes (KGM, LTR, C62, XBX…) → canonical unit via the
		// shared synonym map (issue #297). Previously the raw code was passed
		// through lowercased ("kgm"), which no consumer recognized, so every
		// UBL line demanded a manual conversion rule. Unknown codes → null.
		const unit = typeof unitCodeRaw === 'string' ? canonicalizeUnit(unitCodeRaw) : null;
		const totalLine = getNum(getChild(line, 'LineExtensionAmount'));
		const unitPrice = getNum(getChild(line, 'Price', 'PriceAmount'));
		return {
			description: desc,
			quantity: qty,
			unit,
			unit_price: unitPrice,
			total_price: totalLine,
			confidence: 1.0,
		};
	});

	return {
		supplier_name: supplierName,
		supplier_nif: nif,
		invoice_number: invoiceNumber,
		invoice_date: invoiceDate,
		due_date: dueDate,
		total_amount: totalAmount,
		currency,
		tax_base: taxBase,
		tax_breakdown: taxBreakdown,
		confidence: 1.0,
		field_confidences: {
			supplier_name: supplierName ? 1.0 : 0,
			invoice_number: invoiceNumber ? 1.0 : 0,
			invoice_date: invoiceDate ? 1.0 : 0,
			total_amount: totalAmount != null ? 1.0 : 0,
		},
		line_items,
		e_invoice_format: 'ubl_21',
	};
}

// ── Public API ────────────────────────────────────────────────────────────────

export type ParsedEinvoice = ExtractedInvoice & {
	e_invoice_format: EinvoiceFormat;
	supplier_nif: string | null;
};

/**
 * Auto-detects XML format and delegates to the appropriate parser.
 * Returns null if the XML is not a recognised e-invoice format.
 */
export function parseEinvoice(xml: string): ParsedEinvoice | null {
	const format = detectEinvoiceFormat(xml);
	if (format === 'facturae_322') return parseFacturae322(xml);
	if (format === 'ubl_21') return parseUbl21Invoice(xml);
	return null;
}
