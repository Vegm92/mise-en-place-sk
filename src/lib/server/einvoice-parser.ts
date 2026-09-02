import { XMLParser } from 'fast-xml-parser';
import { canonicalizeUnit } from './normalize';
import type { ExtractedInvoice } from './extract';
import type { PaymentMethod } from '$lib/constants';

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
	parseAttributeValue: false,
	parseTagValue: true,
	isArray: (name) =>
		['InvoiceLine', 'Tax', 'TaxSubtotal', 'TaxTotal', 'AllowanceCharge', 'Installment', 'PaymentMeans'].includes(name),
	numberParseOptions: { leadingZeros: true, hex: false, skipLike: /^0\d|^\+/ },
});

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

const FACTURAE_PAYMENT_MEANS: Record<string, PaymentMethod> = {
	'01': 'efectivo',
	'02': 'domiciliacion',
	'04': 'transferencia',
	'09': 'pagare',
	'10': 'pagare',
	'15': 'giro',
	'19': 'tarjeta',
};

function facturaePaymentMethod(code: string | null): PaymentMethod | null {
	if (!code) return null;
	return FACTURAE_PAYMENT_MEANS[code] ?? 'otro';
}

const UBL_PAYMENT_MEANS: Record<string, PaymentMethod> = {
	'10': 'efectivo',
	'30': 'transferencia',
	'42': 'transferencia',
	'48': 'tarjeta',
	'49': 'domiciliacion',
	'58': 'transferencia',
	'59': 'domiciliacion',
};

function ublPaymentMethod(code: string | null): PaymentMethod | null {
	if (!code) return null;
	return UBL_PAYMENT_MEANS[code] ?? 'otro';
}

interface PartyFields {
	name: string | null;
	nif: string | null;
	address: string | null;
}

function joinAddress(parts: Array<string | null>): string | null {
	return parts.filter((v): v is string => !!v).join(', ') || null;
}

function facturaeParty(party: Record<string, unknown>): PartyFields {
	const entity = (party['LegalEntity'] ?? party['Individual'] ?? {}) as Record<string, unknown>;
	const addressNode = (entity['AddressInSpain'] ?? entity['OverseasAddress']) as Record<string, unknown> | undefined;
	return {
		name:
			getText(getChild(party, 'LegalEntity', 'CorporateName')) ??
			getText(getChild(party, 'Individual', 'Name')),
		nif: getText(getChild(party, 'TaxIdentification', 'TaxIdentificationNumber')),
		address: addressNode
			? joinAddress([getText(addressNode['Address']), getText(addressNode['PostCode']), getText(addressNode['Town'])])
			: null,
	};
}

function ublParty(party: Record<string, unknown> | undefined): PartyFields {
	const postalAddress = party?.['PostalAddress'] as Record<string, unknown> | undefined;
	return {
		name:
			getText(getChild(party, 'PartyName', 'Name')) ??
			getText(getChild(party, 'PartyLegalEntity', 'RegistrationName')),
		nif:
			getText(getChild(party, 'PartyTaxScheme', 'CompanyID')) ??
			getText(getChild(party, 'PartyLegalEntity', 'CompanyID')),
		address: postalAddress
			? joinAddress([
				getText(postalAddress['StreetName']),
				getText(postalAddress['CityName']),
				getText(postalAddress['PostalZone']),
			])
			: null,
	};
}

interface EinvoiceParts {
	supplier: PartyFields;
	receiver: PartyFields;
	supplierEmail: string | null;
	supplierPhone: string | null;
	paymentMethod: PaymentMethod | null;
	iban: string | null;
	invoiceNumber: string | null;
	invoiceDate: string | null;
	dueDate: string | null;
	totalAmount: number | null;
	currency: string;
	taxBase: number | null;
	grossAmount: number | null;
	discountAmount: number | null;
	retentionRate: number | null;
	retentionAmount: number | null;
	taxBreakdown: ExtractedInvoice['tax_breakdown'];
	lineItems: ExtractedInvoice['line_items'];
	format: EinvoiceFormat;
}

function einvoiceResult(parts: EinvoiceParts): ParsedEinvoice {
	const { supplier, receiver, invoiceNumber, invoiceDate, totalAmount } = parts;
	return {
		supplier_name: supplier.name,
		supplier_nif: supplier.nif,
		supplier_address: supplier.address,
		supplier_email: parts.supplierEmail,
		supplier_phone: parts.supplierPhone,
		receiver_name: receiver.name,
		receiver_nif: receiver.nif,
		receiver_address: receiver.address,
		payment_method: parts.paymentMethod,
		iban: parts.iban,
		payment_terms: null,
		invoice_number: invoiceNumber,
		document_type: 'factura',
		invoice_date: invoiceDate,
		due_date: parts.dueDate,
		total_amount: totalAmount,
		currency: parts.currency,
		tax_base: parts.taxBase,
		gross_amount: parts.grossAmount,
		discount_amount: parts.discountAmount,
		retention_rate: parts.retentionRate,
		retention_amount: parts.retentionAmount,
		tax_breakdown: parts.taxBreakdown,
		confidence: 1.0,
		field_confidences: {
			supplier_name: supplier.name ? 1.0 : 0,
			supplier_nif: supplier.nif ? 1.0 : 0,
			receiver_name: receiver.name ? 1.0 : 0,
			receiver_nif: receiver.nif ? 1.0 : 0,
			invoice_number: invoiceNumber ? 1.0 : 0,
			document_type: 1.0,
			invoice_date: invoiceDate ? 1.0 : 0,
			total_amount: totalAmount != null ? 1.0 : 0,
			iban: parts.iban ? 1.0 : 0,
		},
		line_items: parts.lineItems,
		e_invoice_format: parts.format,
	};
}

export function parseFacturae322(xml: string): ExtractedInvoice & { e_invoice_format: EinvoiceFormat; supplier_nif: string | null } {
	const doc = parser.parse(xml) as Record<string, unknown>;

	const root = (doc['Facturae'] ?? Object.values(doc)[0]) as Record<string, unknown>;

	const parties = root['Parties'] as Record<string, unknown> | undefined;
	const seller = (parties?.['SellerParty'] ?? {}) as Record<string, unknown>;

	const supplier = facturaeParty(seller);

	const contactDetails = seller['ContactDetails'] as Record<string, unknown> | undefined;
	const supplierEmail = getText(contactDetails?.['ElectronicMail']);
	const supplierPhone = getText(contactDetails?.['Telephone']);

	const receiver = facturaeParty((parties?.['BuyerParty'] ?? {}) as Record<string, unknown>);

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

	const paymentDetails = invoice['PaymentDetails'] as Record<string, unknown> | undefined;
	const installments = getArr(paymentDetails, 'Installment');
	const firstInstallment = (installments[0] ?? {}) as Record<string, unknown>;
	const paymentMethod = facturaePaymentMethod(getText(firstInstallment['PaymentMeans']));
	const iban = getText(getChild(firstInstallment, 'AccountToBeCredited', 'IBAN'));

	const totals = (invoice['InvoiceTotals'] ?? {}) as Record<string, unknown>;
	const totalAmount =
		getNum(totals['TotalInvoiceAmount']) ??
		getNum(totals['TotalExecutableAmount']);
	const grossAmount = getNum(totals['TotalGrossAmount']);
	const discountAmount = getNum(totals['TotalGeneralDiscounts']) || null;
	const taxBase = grossAmount !== null ? grossAmount - (discountAmount ?? 0) : null;

	const taxesOutputs = invoice['TaxesOutputs'] as Record<string, unknown> | undefined;
	const taxes = getArr(taxesOutputs, 'Tax');
	const taxBreakdown = taxes.length
		? taxes.map((tax) => ({
			rate: (getNum(getChild(tax, 'TaxRate')) ?? 0) / 100,
			base: getNum(getChild(tax, 'TaxableBase', 'TotalAmount')) ?? 0,
			tax_amount: getNum(getChild(tax, 'TaxAmount', 'TotalAmount')) ?? 0,
		}))
		: null;

	const taxesWithheld = invoice['TaxesWithheld'] as Record<string, unknown> | undefined;
	const withheldTaxes = getArr(taxesWithheld, 'Tax');
	const retentionRate = withheldTaxes.length ? (getNum(getChild(withheldTaxes[0], 'TaxRate')) ?? 0) / 100 : null;
	const retentionAmount = withheldTaxes.length
		? withheldTaxes.reduce((sum: number, tax) => sum + (getNum(getChild(tax, 'TaxAmount', 'TotalAmount')) ?? 0), 0)
		: null;

	const items = invoice['Items'] as Record<string, unknown> | undefined;
	const lines = getArr(items, 'InvoiceLine');
	const line_items = lines.map((line) => {
		const uom = getText(getChild(line, 'UnitOfMeasure'));
		return {
			description: getText(getChild(line, 'ItemDescription')) ?? '',
			quantity: getNum(getChild(line, 'Quantity')),
			unit: (uom ? (FACTURAE_UNIT_CODES[uom] ?? canonicalizeUnit(uom)) : null),
			unit_price: getNum(getChild(line, 'UnitPriceWithoutTax')),
			total_price: getNum(getChild(line, 'TotalCost')) ?? getNum(getChild(line, 'GrossAmount')),
			confidence: 1.0,
		};
	});

	return einvoiceResult({
		supplier, receiver, supplierEmail, supplierPhone, paymentMethod, iban,
		invoiceNumber: fullNumber, invoiceDate, dueDate: null,
		totalAmount, currency, taxBase,
		grossAmount: discountAmount ? grossAmount : null,
		discountAmount, retentionRate, retentionAmount,
		taxBreakdown, lineItems: line_items, format: 'facturae_322',
	});
}

export function parseUbl21Invoice(xml: string): ExtractedInvoice & { e_invoice_format: EinvoiceFormat; supplier_nif: string | null } {
	const doc = parser.parse(xml) as Record<string, unknown>;
	const inv = (doc['Invoice'] ?? Object.values(doc)[0]) as Record<string, unknown>;

	const supplierParty = getChild(inv, 'AccountingSupplierParty', 'Party') as Record<string, unknown> | undefined;

	const supplier = ublParty(supplierParty);

	const contact = supplierParty?.['Contact'] as Record<string, unknown> | undefined;
	const supplierEmail = getText(contact?.['ElectronicMail']);
	const supplierPhone = getText(contact?.['Telephone']);

	const receiver = ublParty(getChild(inv, 'AccountingCustomerParty', 'Party') as Record<string, unknown> | undefined);

	const invoiceNumber = getText(inv['ID']);
	const invoiceDate = getText(inv['IssueDate']);
	const dueDate = getText(inv['DueDate']);

	const paymentMeansList = getArr(inv, 'PaymentMeans');
	const firstPaymentMeans = (paymentMeansList[0] ?? {}) as Record<string, unknown>;
	const paymentMethod = ublPaymentMethod(getText(firstPaymentMeans['PaymentMeansCode']));
	const iban = getText(getChild(firstPaymentMeans, 'PayeeFinancialAccount', 'ID'));

	const totals = inv['LegalMonetaryTotal'] as Record<string, unknown> | undefined;
	const totalAmount =
		getNum(getChild(totals, 'PayableAmount')) ??
		getNum(getChild(totals, 'TaxInclusiveAmount'));
	const grossAmount = getNum(getChild(totals, 'LineExtensionAmount'));
	const taxBase =
		getNum(getChild(totals, 'TaxExclusiveAmount')) ??
		grossAmount;

	const payableNode = getChild(totals, 'PayableAmount') as Record<string, unknown> | undefined;
	const currency = (payableNode?.['@_currencyID'] as string | undefined) ?? 'EUR';

	const allowanceCharges = getArr(inv, 'AllowanceCharge');
	const discounts = allowanceCharges.filter((ac) => getText(getChild(ac, 'ChargeIndicator')) === 'false');
	const discountAmount = discounts.length
		? discounts.reduce((sum: number, ac) => sum + (getNum(getChild(ac, 'Amount')) ?? 0), 0)
		: null;

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

	const withholdingTotals = getArr(inv, 'WithholdingTaxTotal');
	const firstWithholding = withholdingTotals[0] as Record<string, unknown> | undefined;
	const withholdingSubtotals = getArr(firstWithholding, 'TaxSubtotal');
	const retentionRate = withholdingSubtotals.length
		? (getNum(getChild(withholdingSubtotals[0], 'TaxCategory', 'Percent')) ?? 0) / 100
		: null;
	const retentionAmount = firstWithholding ? getNum(getChild(firstWithholding, 'TaxAmount')) : null;

	const lineNodes = getArr(inv, 'InvoiceLine');
	const line_items = lineNodes.map((line) => {
		const desc =
			getText(getChild(line, 'Item', 'Description')) ??
			getText(getChild(line, 'Item', 'Name')) ??
			'';
		const qty = getNum(getChild(line, 'InvoicedQuantity'));
		const unitCodeRaw = (getChild(line, 'InvoicedQuantity') as Record<string, unknown> | undefined)?.['@_unitCode'];
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

	return einvoiceResult({
		supplier, receiver, supplierEmail, supplierPhone, paymentMethod, iban,
		invoiceNumber, invoiceDate, dueDate,
		totalAmount, currency, taxBase,
		grossAmount: discountAmount ? grossAmount : null,
		discountAmount, retentionRate, retentionAmount,
		taxBreakdown, lineItems: line_items, format: 'ubl_21',
	});
}

export type ParsedEinvoice = ExtractedInvoice & {
	e_invoice_format: EinvoiceFormat;
	supplier_nif: string | null;
};

export function parseEinvoice(xml: string): ParsedEinvoice | null {
	const format = detectEinvoiceFormat(xml);
	if (format === 'facturae_322') return parseFacturae322(xml);
	if (format === 'ubl_21') return parseUbl21Invoice(xml);
	return null;
}
