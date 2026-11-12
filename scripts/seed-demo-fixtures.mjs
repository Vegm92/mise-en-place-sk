/**
 * Pure helpers for scripts/seed-demo-data.mjs, kept separate so the amounts and
 * keys the seed writes can be unit-tested without a database.
 */

export const FOOD_VAT_RATE = 0.1;

export const OLIVE_OIL = {
	canonical: 'Aceite de oliva virgen extra',
	nameKey: 'aceite-de-oliva-virgen-extra',
	category: 'Aceites y Conservas',
	unit: 'l',
	quantity: 10,
	supplierIndex: 1,
	basePrice: 7.7,
	risenPrice: 9.4,
};

/** @param {string} raw */
export function normalizeAliasKey(raw) {
	return raw
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {number} supplierIndex @param {number} productNumber */
export function supplierSku(supplierIndex, productNumber) {
	return `${String.fromCharCode(65 + supplierIndex)}${String(productNumber).padStart(3, '0')}`;
}

/** @param {string} canonical @param {string} sku */
export function lineDescription(canonical, sku) {
	return `${canonical} ref. ${sku}`;
}

/** @param {number} i @returns {'factura' | 'albaran'} */
export function documentTypeFor(i) {
	return i % 6 === 5 ? 'albaran' : 'factura';
}

/** @param {number} i */
export function documentNumberFor(i) {
	return documentTypeFor(i) === 'albaran' ? `ALB-2024-${1000 + i}` : `F-2024-${1000 + i}`;
}

/** @param {string | number} amount */
function toCents(amount) {
	return Math.round(Number(amount) * 100);
}

/** @param {number} cents */
function centsToMoney(cents) {
	return (cents / 100).toFixed(2);
}

/** @param {number} quantity @param {number} unitPrice */
export function lineTotal(quantity, unitPrice) {
	return centsToMoney(Math.round(quantity * toCents(unitPrice)));
}

/** @param {string[]} lineTotals @param {number} [rate] */
export function invoiceTotals(lineTotals, rate = FOOD_VAT_RATE) {
	const baseCents = lineTotals.reduce((sum, t) => sum + toCents(t), 0);
	const taxCents = Math.round(baseCents * rate);
	const base = centsToMoney(baseCents);
	const tax = centsToMoney(taxCents);
	return {
		taxBase: base,
		taxAmount: tax,
		totalAmount: centsToMoney(baseCents + taxCents),
		taxBreakdown: JSON.stringify([{ rate, base: Number(base), tax_amount: Number(tax), type: 'iva' }]),
	};
}

/** @param {number} i @returns {number | null} */
export function oliveOilPriceFor(i) {
	if (i % 8 !== OLIVE_OIL.supplierIndex) return null;
	return i === OLIVE_OIL.supplierIndex ? OLIVE_OIL.risenPrice : OLIVE_OIL.basePrice;
}
