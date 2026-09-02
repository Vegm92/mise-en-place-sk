import { computeInvoiceContentHash } from './dedup';
import { db, forTenant } from './db';
import { invoices, invoiceLineItems, extractionCorrections, settings, suppliers } from './schema';
import { eq, and, isNull, inArray, notInArray } from 'drizzle-orm';
import { resolveUnit, resolveLineProducts, parsePack, normalizedUnitPrice, applyExtractedAllergens, assignLineProduct, getProductName } from './products';
import { enqueueCategorize, enqueueNormalize } from './queue';
import { normalizeProductKey, isSameSupplierName } from './normalize';
import { runPriceShock, runStockForecast, runBudgetCheck, runCategorizationNudge, runCategorySuggestion, runPossibleDuplicatePurchase, saveAlerts, type Alert } from './alerts';
import { getTierFeatures } from './billing';
import { maybeSendQuotaWarning } from './quota-warning';
import { trackEvent } from './events';
import { claimRequest, releaseRequest, isValidKey } from './idempotency';
import { getOrCreateSupplierId, type SupplierContactInfo } from './supplier';
import { resolveCategory, UNCATEGORIZED_CATEGORY } from '$lib/constants';
import type { EnrichedLineItem, PackInfo } from './products';
import type { ExtractedInvoice } from './extract';
import type { BatchDb, BatchItem } from './batch';
import { parseQrUrl, detectVerifactuMismatch } from './qr';
import { toMoneyString, moneyToNumber, parseAmount } from './money';
import { bandsFromInputs, taxableBaseMoney, detectTotalMismatch as detectAmountMismatch, type TaxBand } from '$lib/tax';
import { renderTemplate } from '$lib/i18n-messages';
import { isBlankOrIsoDate, toIsoDate } from './dates';
import type { IncidenceKind, ReviewState } from '$lib/status';

export type SaveOutcome =
	| { type: 'lowConfidenceBlocked' }
	| { type: 'invalidDate'; field: 'invoice_date' | 'due_date' }
	| { type: 'invalidAmount'; field: string }
	| { type: 'contentDuplicate'; duplicateId: number }
	| { type: 'numberDuplicate' }
	| { type: 'replay' }
	| { type: 'saved'; invoiceId: number; isFirstInvoice: boolean };

const MONETARY_LINE_FIELDS = ['line_quantities', 'line_unit_prices', 'line_total_prices', 'line_tax_rates'] as const;

export function findInvalidMonetaryField(formData: FormData): string | null {
	const totalAmountRaw = formData.get('total_amount');
	if (totalAmountRaw !== null) {
		if (typeof totalAmountRaw !== 'string') return 'total_amount';
		if (totalAmountRaw.trim() !== '' && parseAmount(totalAmountRaw) === null) return 'total_amount';
	}

	const descriptions = formData.getAll('line_descriptions').map(String);
	for (const field of MONETARY_LINE_FIELDS) {
		const values = formData.getAll(field).map(String);
		for (let i = 0; i < descriptions.length; i++) {
			if (!descriptions[i].trim()) continue;
			const raw = values[i];
			if (raw !== undefined && raw.trim() !== '' && parseAmount(raw) === null) return field;
		}
	}

	return null;
}

type HeaderSnapshot = {
	supplierName: string;
	invoiceNumber: string;
	invoiceDate: string | null;
	dueDate: string | null;
	totalAmount: string | null;
};

type LineSnapshot = {
	lineDescriptions: string[];
	lineQuantities: string[];
	lineUnits: string[];
	lineUnitPrices: string[];
	lineTotalPrices: string[];
};

function normalizeStr(v: unknown): string {
	return String(v ?? '').trim().toLowerCase();
}

function normalizeNum(v: unknown): string {
	const n = parseAmount(v);
	return n === null ? '' : n.toString();
}

type CorrectionRow = typeof extractionCorrections.$inferInsert;
type FieldComparison = { field: string; origRaw: unknown; submittedVal: string; numeric?: boolean; confidence?: number | null };

function numericOrNull(v: unknown): number | null {
	return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function correctionRows(
	comparisons: FieldComparison[],
	target: { invoiceId: number; supplierId: number; restaurantId: string },
	lineItemIndex: number | null,
): CorrectionRow[] {
	const rows: CorrectionRow[] = [];
	for (const { field, origRaw, submittedVal, numeric, confidence } of comparisons) {
		const orig = numeric ? normalizeNum(origRaw) : normalizeStr(origRaw);
		const sub  = numeric ? normalizeNum(submittedVal) : normalizeStr(submittedVal);
		if (orig !== sub) {
			rows.push({
				...target,
				fieldName: field,
				originalValue: orig || null,
				correctedValue: sub || null,
				lineItemIndex,
				fieldConfidence: confidence ?? null,
			});
		}
	}
	return rows;
}

export function productCorrectionRows(
	productCorrections: ProductCorrection[],
	target: { invoiceId: number; supplierId: number; restaurantId: string },
	originalLines: Array<Record<string, unknown>>,
): CorrectionRow[] {
	return productCorrections
		.filter((c) => normalizeStr(c.originalName) !== normalizeStr(c.correctedName))
		.map((c) => ({
			...target,
			fieldName: 'line_item.product',
			originalValue: normalizeStr(c.originalName) || null,
			correctedValue: normalizeStr(c.correctedName) || null,
			lineItemIndex: c.lineItemIndex,
			fieldConfidence: c.lineItemIndex == null
				? null
				: numericOrNull(originalLines[c.lineItemIndex]?.confidence),
		}));
}

async function logExtractionCorrections(
	invoiceId: number,
	supplierId: number,
	restaurantId: string,
	originalData: Record<string, unknown> | undefined,
	submitted: HeaderSnapshot,
	submittedLines: LineSnapshot,
	productCorrections: ProductCorrection[] = [],
) {
	if (!originalData && productCorrections.length === 0) return;

	const target = { invoiceId, supplierId, restaurantId };
	const rows: CorrectionRow[] = [];
	const fieldConfs = (originalData?.field_confidences as Record<string, unknown> | undefined) ?? {};
	const headerConf = (field: string) => numericOrNull(fieldConfs[field]);

	const headerComparisons: FieldComparison[] = originalData ? [
		{ field: 'supplier_name',  origRaw: originalData.supplier_name,  submittedVal: submitted.supplierName, confidence: headerConf('supplier_name') },
		{ field: 'invoice_number', origRaw: originalData.invoice_number, submittedVal: submitted.invoiceNumber, confidence: headerConf('invoice_number') },
		{ field: 'invoice_date',   origRaw: originalData.invoice_date,   submittedVal: submitted.invoiceDate ?? '', confidence: headerConf('invoice_date') },
		{ field: 'due_date',       origRaw: originalData.due_date,       submittedVal: submitted.dueDate ?? '', confidence: headerConf('due_date') },
		{ field: 'total_amount',   origRaw: originalData.total_amount,   submittedVal: String(submitted.totalAmount ?? ''), numeric: true, confidence: headerConf('total_amount') },
	] : [];

	rows.push(...correctionRows(headerComparisons, target, null));

	const originalLines = Array.isArray(originalData?.line_items)
		? (originalData.line_items as Array<Record<string, unknown>>)
		: [];

	const { lineDescriptions, lineQuantities, lineUnits, lineUnitPrices, lineTotalPrices } = submittedLines;
	const compareCount = Math.min(lineDescriptions.length, originalLines.length);

	for (let i = 0; i < compareCount; i++) {
		const orig = originalLines[i];
		const lineConf = numericOrNull(orig.confidence);
		const lineFields: FieldComparison[] = [
			{ field: 'line_item.description', origRaw: orig.description, submittedVal: lineDescriptions[i] ?? '', confidence: lineConf },
			{ field: 'line_item.quantity',    origRaw: orig.quantity,    submittedVal: lineQuantities[i] ?? '',    numeric: true, confidence: lineConf },
			{ field: 'line_item.unit',        origRaw: orig.unit,        submittedVal: lineUnits[i] ?? '', confidence: lineConf },
			{ field: 'line_item.unit_price',  origRaw: orig.unit_price,  submittedVal: lineUnitPrices[i] ?? '',   numeric: true, confidence: lineConf },
			{ field: 'line_item.total_price', origRaw: orig.total_price, submittedVal: lineTotalPrices[i] ?? '',  numeric: true, confidence: lineConf },
		];
		rows.push(...correctionRows(lineFields, target, i));
	}

	rows.push(...productCorrectionRows(productCorrections, target, originalLines));

	if (rows.length > 0) {
		await db.insert(extractionCorrections).values(rows);
		trackEvent('invoice_corrected', restaurantId, {
			field_count: rows.length,
			fields: rows.map((r) => r.fieldName),
		}, invoiceId);
	}
}

type TenantScope = ReturnType<typeof forTenant>;

async function insertEnrichedLines(
	tx: BatchDb,
	target: { invoiceId: number; rid: string; supplierId: number; supplierName: string },
	enrichedLines: EnrichedLine[],
	savedItems: EnrichedLineItem[],
	unitConversionAlerts: Alert[],
): Promise<void> {
	for (const line of enrichedLines) {
		const li = line.input;

		await tx.insert(invoiceLineItems).values({
			invoiceId: target.invoiceId,
			restaurantId: target.rid,
			...line.columns,
		});

		savedItems.push(line.item);

		if (line.requiresUnitConversion) {
			const unitConversionVars = { ingredient: li.desc, quantity: li.qtyFloat ?? '?', unit: li.unitVal ?? '' };
			unitConversionAlerts.push({
				notificationType: 'unit_conversion_needed',
				message: renderTemplate('es', 'notif.msg.unitConversion', unitConversionVars),
				payload: {
					supplierId: target.supplierId, supplierName: target.supplierName, ingredient: li.desc, purchaseUnit: li.unitVal, quantity: li.qtyFloat,
					messageKey: 'notif.msg.unitConversion',
					messageVars: unitConversionVars,
				},
			});
		}
	}
}

async function invoiceNumberTaken(
	tx: BatchDb,
	tdb: TenantScope,
	supplierId: number,
	invoiceNumber: string,
): Promise<boolean> {
	const dup = await tx
		.select({ id: invoices.id })
		.from(invoices)
		.where(and(tdb.scope(invoices.restaurantId), eq(invoices.supplierId, supplierId), eq(invoices.invoiceNumber, invoiceNumber)))
		.limit(1);
	return dup.length > 0;
}

export async function findExistingFilenames(restaurantId: string): Promise<Set<string>> {
	const tdb = forTenant(restaurantId);
	const rows = await db
		.select({ sourceFile: invoices.sourceFile })
		.from(invoices)
		.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)));
	return new Set(rows.map((r) => r.sourceFile?.toLowerCase()).filter((n): n is string => !!n));
}

async function findContentHashDuplicate(
	tx: BatchDb,
	tdb: TenantScope,
	contentHash: string,
): Promise<number | null> {
	const dup = await tx
		.select({ id: invoices.id })
		.from(invoices)
		.where(and(tdb.scope(invoices.restaurantId), eq(invoices.contentHash, contentHash), isNull(invoices.deletedAt)))
		.limit(1);
	return dup.length > 0 ? dup[0].id : null;
}

export type LineFormInput = {
	desc: string;
	qtyFloat: number | null;
	unitPriceFloat: number | null;
	unitVal: string | null;
	totalPriceVal: number | null;
	taxRateVal: number | null;
	pack: PackInfo | null;
	supplierSku: string | null;
	productId?: number | null;
	formIndex?: number;
};

export type EnrichedLine = {
	input: LineFormInput;
	columns: Omit<typeof invoiceLineItems.$inferInsert, 'invoiceId' | 'restaurantId'>;
	item: EnrichedLineItem;
	requiresUnitConversion: boolean;
};

export function computeFormContentHash(
	header: {
		supplierName: string;
		invoiceNumber: string;
		invoiceDate: string | null;
		dueDate: string | null;
		totalAmount: string | null;
	},
	formData: FormData,
	taxBands: TaxBand[] | null = null,
): string {
	const descriptions = formData.getAll('line_descriptions').map(String);
	const quantities   = formData.getAll('line_quantities').map(String);
	const units        = formData.getAll('line_units').map(String);
	const unitPrices   = formData.getAll('line_unit_prices').map(String);
	const totalPrices  = formData.getAll('line_total_prices').map(String);
	const taxRates     = formData.getAll('line_tax_rates').map(String);

	const kept: number[] = [];
	for (let i = 0; i < descriptions.length; i++) {
		if (descriptions[i].trim()) kept.push(i);
	}

	return computeInvoiceContentHash({
		...header,
		lineDescriptions: kept.map(i => descriptions[i]),
		lineQuantities:   kept.map(i => parseAmount(quantities[i])),
		lineUnits:        kept.map(i => units[i]?.trim() || null),
		lineUnitPrices:   kept.map(i => toMoneyString(unitPrices[i])),
		lineTotalPrices:  kept.map(i => toMoneyString(totalPrices[i])),
		lineTaxRates:     kept.map(i => parseAmount(taxRates[i])),
		taxBands,
	});
}

export function resolveTaxBreakdown(
	formData: FormData,
	extractedData: Record<string, unknown> | undefined,
): { taxBase: string | null; taxBreakdown: string | null; bands: TaxBand[] | null } {
	const raw = extractedData?.tax_breakdown;
	const extractedBands = Array.isArray(raw) ? (raw as TaxBand[]) : null;
	const extractedBase = toMoneyString(extractedData?.tax_base as string | number | null | undefined);

	if (formData.get('tax_bands_present') !== null) {
		const rates   = formData.getAll('tax_rates').map(String);
		const types   = formData.getAll('tax_types').map(String);
		const bases   = formData.getAll('tax_bases').map(String);
		const amounts = formData.getAll('tax_amounts').map(String);

		const bands = bandsFromInputs(rates.map((rate, i) => ({
			rate,
			type: types[i] ?? '',
			base: bases[i] ?? '',
			amount: amounts[i] ?? '',
		})));

		if (bands.length) {
			return { taxBase: taxableBaseMoney(bands), taxBreakdown: JSON.stringify(bands), bands };
		}
		return { taxBase: extractedBands ? null : extractedBase, taxBreakdown: null, bands: null };
	}

	return {
		taxBase: extractedBase,
		taxBreakdown: extractedBands ? JSON.stringify(extractedBands) : null,
		bands: extractedBands,
	};
}

export function parseLineInputs(formData: FormData): LineFormInput[] {
	const descriptions = formData.getAll('line_descriptions').map(String);
	const quantities   = formData.getAll('line_quantities').map(String);
	const units        = formData.getAll('line_units').map(String);
	const unitPrices   = formData.getAll('line_unit_prices').map(String);
	const totalPrices  = formData.getAll('line_total_prices').map(String);
	const taxRates     = formData.getAll('line_tax_rates').map(String);
	const supplierSkus = formData.getAll('line_supplier_skus').map(String);
	const productIds   = formData.getAll('line_product_ids').map(String);

	const out: LineFormInput[] = [];
	for (let i = 0; i < descriptions.length; i++) {
		const desc = descriptions[i].trim();
		if (!desc) continue;
		const unitVal = units[i]?.trim() || null;
		const productId = Number.parseInt(productIds[i] ?? '', 10);
		out.push({
			desc,
			qtyFloat: parseAmount(quantities[i]),
			unitPriceFloat: parseAmount(unitPrices[i]),
			unitVal,
			totalPriceVal: parseAmount(totalPrices[i]),
			taxRateVal: parseAmount(taxRates[i]),
			pack: parsePack(desc, unitVal),
			supplierSku: supplierSkus[i]?.trim() || null,
			productId: Number.isInteger(productId) && productId > 0 ? productId : null,
			formIndex: i,
		});
	}
	return out;
}

export async function enrichLineItems(
	rid: string,
	supplierName: string,
	lineInputs: LineFormInput[],
): Promise<EnrichedLine[]> {
	const unitRules = await Promise.all(
		lineInputs.map(li =>
			li.unitVal ? resolveUnit(supplierName, li.desc, li.unitVal, rid) : Promise.resolve(null)
		)
	);

	return lineInputs.map((li, i) => {
		const rule = unitRules[i];
		const canonicalUnit = rule?.canonicalUnit ?? null;
		const requiresConv = !rule && !!li.unitVal;
		const factor = rule?.conversionFactor ?? 0;
		const convertedQty = rule && factor > 0 && li.qtyFloat != null ? Math.round(li.qtyFloat * factor * 10000) / 10000 : null;
		const convertedPrice = rule && factor > 0 && li.unitPriceFloat != null ? Math.round((li.unitPriceFloat / factor) * 10000) / 10000 : null;
		const pack = li.pack;

		return {
			input: li,
			columns: {
				description: li.desc,
				quantity: li.qtyFloat,
				unit: li.unitVal,
				unitPrice: toMoneyString(li.unitPriceFloat),
				totalPrice: toMoneyString(li.totalPriceVal),
				taxRate: li.taxRateVal,
				requiresUnitConversion: requiresConv,
				canonicalUnit,
				unitsPerPack: pack?.unitsPerPack ?? null,
				unitSize: pack?.unitSize ?? null,
				sizeUnit: pack?.sizeUnit ?? null,
				baseUnit: pack?.baseUnit ?? null,
				normalizedUnitPrice: toMoneyString(normalizedUnitPrice(li.unitPriceFloat, pack)),
				supplierSku: li.supplierSku,
			},
			item: {
				description: li.desc,
				quantity: li.qtyFloat,
				unit: li.unitVal,
				unitPrice: li.unitPriceFloat,
				totalPrice: li.totalPriceVal,
				canonicalUnit,
				requiresUnitConversion: requiresConv,
				convertedQuantity: convertedQty,
				convertedUnitPrice: convertedPrice,
			},
			requiresUnitConversion: requiresConv,
		};
	});
}

export function extractedAllergensByKey(
	extracted: ExtractedInvoice | undefined
): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const line of extracted?.line_items ?? []) {
		if (!Array.isArray(line.allergens) || line.allergens.length === 0) continue;
		const key = normalizeProductKey(String(line.description ?? ''));
		if (key) out.set(key, line.allergens.map(String));
	}
	return out;
}

export type ProductCorrection = {
	lineItemIndex: number | null;
	originalName: string | null;
	correctedName: string;
};

export async function linkProductsToInvoice(
	invoiceId: number,
	supplierId: number,
	rid: string,
	lineInputs: Array<{ desc: string; unitVal: string | null; pack: PackInfo | null; supplierSku: string | null; productId?: number | null; formIndex?: number }>,
	allergensByKey: Map<string, string[]> = new Map(),
): Promise<{ productByKey: Map<string, number>; productCorrections: ProductCorrection[] }> {
	const productByKey = new Map<string, number>();
	const productCorrections: ProductCorrection[] = [];
	const overrideByKey = new Map<string, { productId: number; lineItemIndex: number | null }>();
	for (const [i, li] of lineInputs.entries()) {
		const key = normalizeProductKey(li.desc);
		if (!key || li.productId == null || overrideByKey.has(key)) continue;
		overrideByKey.set(key, { productId: li.productId, lineItemIndex: li.formIndex ?? i });
	}
	try {
		const resolved = await resolveLineProducts(
			db, rid, supplierId,
			lineInputs.map(li => ({
				description: li.desc,
				unit: li.unitVal,
				category: null,
				unitsPerPack: li.pack?.unitsPerPack ?? null,
				baseUnit: li.pack?.baseUnit ?? null,
				supplierSku: li.supplierSku,
			})),
		);

		const suggestions: Alert[] = [];
		for (const [desc, r] of resolved) {
			const descKey = normalizeProductKey(desc);
			const override = overrideByKey.get(descKey);
			let productId = r.productId;
			let reassigned = false;

			if (override && override.productId !== r.productId) {
				const assigned = await assignLineProduct(db, rid, supplierId, desc, override.productId);
				if (assigned) {
					productCorrections.push({
						lineItemIndex: override.lineItemIndex,
						originalName: r.suggestion?.candidateName ?? await getProductName(db, rid, r.productId),
						correctedName: assigned.productName,
					});
					productId = assigned.productId;
					reassigned = true;
				}
			}

			await db.update(invoiceLineItems)
				.set({ productId })
				.where(and(
					forTenant(rid).scope(invoiceLineItems.restaurantId),
					eq(invoiceLineItems.invoiceId, invoiceId),
					eq(invoiceLineItems.description, desc),
				));
			productByKey.set(descKey, productId);

			const codes = allergensByKey.get(descKey);
			if (codes && codes.length > 0) {
				const applied = await applyExtractedAllergens(rid, productId, codes)
					.catch((e) => {
						console.error('[invoice-save] allergen apply failed (non-fatal):', e);
						return false;
					});
				if (applied) {
					suggestions.push({
						notificationType: 'product_allergens_suggested',
						message: `product_allergens_suggested: ${desc}`,
						payload: {
							description: desc,
							productId,
							allergens: codes,
							messageKey: 'notif.msg.productAllergens',
							messageVars: { description: desc },
						},
					});
				}
			}

			if (r.status === 'fuzzy' && r.suggestion && !reassigned) {
				const productSuggestionVars = { description: desc, candidateName: r.suggestion.candidateName };
				suggestions.push({
					notificationType: 'product_suggestion',
					message: renderTemplate('es', 'notif.msg.productSuggestion', productSuggestionVars),
					payload: {
						description: desc,
						productId: r.productId,
						candidateName: r.suggestion.candidateName,
						score: Math.round(r.suggestion.score * 100) / 100,
						messageKey: 'notif.msg.productSuggestion',
						messageVars: productSuggestionVars,
					},
				});
			} else if (r.status === 'created' && !reassigned) {
				await enqueueNormalize(rid, productId, desc).catch((e) =>
					console.error('[invoice-save] normalize enqueue failed (non-fatal):', e));
				await enqueueCategorize(rid, productId, desc).catch((e) =>
					console.error('[invoice-save] categorize enqueue failed (non-fatal):', e));
			}
		}
		if (suggestions.length > 0) await saveAlerts(invoiceId, rid, suggestions);
	} catch (err) {
		console.error('[invoice-save] product linking failed (non-fatal):', err);
	}
	return { productByKey, productCorrections };
}

export function detectTotalMismatch(
	lineInputs: LineFormInput[],
	taxBands: TaxBand[] | null,
	totalAmount: string | null,
): boolean {
	return detectAmountMismatch(lineInputs.map((li) => li.totalPriceVal), taxBands, totalAmount);
}

export function resolveReviewState(signals: {
	lowConfidenceAcked: boolean;
	totalMismatch: boolean;
	conversionNeeded: boolean;
	qrMismatch: boolean;
}): { reviewState: ReviewState; incidenceKind: IncidenceKind | null } {
	const flagged = signals.lowConfidenceAcked || signals.totalMismatch || signals.conversionNeeded || signals.qrMismatch;
	return flagged
		? { reviewState: 'incidencia', incidenceKind: 'lectura' }
		: { reviewState: 'revisado', incidenceKind: null };
}

const HEADER_CONFIDENCE_FIELDS = ['supplier_name', 'invoice_number', 'invoice_date', 'due_date', 'total_amount'];

function isLowConfidenceBlocked(item: BatchItem | null, formData: FormData): boolean {
	if (formData.get('low_confidence_ack') === 'true') return false;
	const extractedData = item?.extractedData ?? undefined;
	const fieldConfs = (extractedData?.field_confidences as Record<string, number> | undefined) ?? {};
	const hasLowConf = HEADER_CONFIDENCE_FIELDS.some(f => fieldConfs[f] != null && fieldConfs[f] < 0.85);
	const overallConf = typeof extractedData?.confidence === 'number' ? extractedData.confidence : 1;
	return hasLowConf || overallConf < 0.85;
}

function resolveSupplierInfo(extracted: ExtractedInvoice | undefined, supplierName: string): { proposedCategory: string; proposedContact: SupplierContactInfo } {
	const sameSupplier = typeof extracted?.supplier_name === 'string' && isSameSupplierName(extracted.supplier_name, supplierName);
	return {
		proposedCategory: sameSupplier
			? resolveCategory(extracted?.supplier_category, extracted?.field_confidences?.supplier_category)
			: UNCATEGORIZED_CATEGORY,
		proposedContact: sameSupplier
			? { cif: extracted?.supplier_nif ?? null, email: extracted?.supplier_email ?? null, phone: extracted?.supplier_phone ?? null, address: extracted?.supplier_address ?? null }
			: {},
	};
}

async function linkRelatedDocuments(
	tdb: ReturnType<typeof forTenant>,
	invoiceId: number,
	linkedInvoiceId: number,
): Promise<void> {
	const pair = [invoiceId, linkedInvoiceId];
	await db.update(invoices)
		.set({ linkedInvoiceId: null })
		.where(tdb.scope(invoices.restaurantId, and(
			inArray(invoices.linkedInvoiceId, pair),
			notInArray(invoices.id, pair),
		)!));
	await db.update(invoices)
		.set({ linkedInvoiceId })
		.where(tdb.scope(invoices.restaurantId, eq(invoices.id, invoiceId)));
	await db.update(invoices)
		.set({ linkedInvoiceId: invoiceId })
		.where(tdb.scope(invoices.restaurantId, eq(invoices.id, linkedInvoiceId)));
}

async function isolated<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		console.error(`[invoice-save] ${label} failed (non-fatal):`, err);
		return fallback;
	}
}

async function runPostSaveEffects(params: {
	invoiceId: number;
	supplierId: number;
	rid: string;
	supplierName: string;
	invoiceNumber: string;
	invoiceDate: string | null;
	dueDate: string | null;
	totalAmount: string | null;
	documentType: 'factura' | 'albaran' | null;
	confidenceRaw: number | null;
	lineInputs: LineFormInput[];
	savedItems: EnrichedLineItem[];
	unitConversionAlerts: Alert[];
	qrMismatches: ReturnType<typeof detectVerifactuMismatch>;
	extractedData: Record<string, unknown> | undefined;
	lineDescriptions: string[];
	lineQuantities: string[];
	lineUnits: string[];
	lineUnitPrices: string[];
	lineTotalPrices: string[];
	proposedCategory: string;
	reviewState: ReviewState;
	tdb: ReturnType<typeof forTenant>;
}): Promise<boolean> {
	const { invoiceId, supplierId, rid, supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount, documentType, confidenceRaw, lineInputs, savedItems, unitConversionAlerts, qrMismatches, extractedData, lineDescriptions, lineQuantities, lineUnits, lineUnitPrices, lineTotalPrices, proposedCategory, reviewState, tdb } = params;

	const { productByKey, productCorrections } = await isolated(
		'product linking',
		{ productByKey: new Map<string, number>(), productCorrections: [] as ProductCorrection[] },
		() => linkProductsToInvoice(
			invoiceId, supplierId, rid, lineInputs,
			extractedAllergensByKey(extractedData as ExtractedInvoice | undefined),
		),
	);

	const alertEffects: Array<{ key: string; label: string; run: () => Promise<Alert[]> }> = [
		{
			key: 'priceShock', label: 'price shock alerts',
			run: () => runPriceShock(invoiceId, supplierName, savedItems, rid, productByKey),
		},
		{
			key: 'stockForecast', label: 'stock forecast',
			run: async () => {
				const { stockTracking } = await getTierFeatures(rid);
				return stockTracking ? runStockForecast(savedItems, rid) : [];
			},
		},
		{ key: 'budgetCheck', label: 'budget check', run: () => runBudgetCheck(invoiceId, supplierId, rid) },
		{
			key: 'categorizationNudge', label: 'categorization nudge',
			run: () => runCategorizationNudge(invoiceId, supplierId, rid),
		},
		{
			key: 'categorySuggestion', label: 'category suggestion',
			run: () => runCategorySuggestion(supplierId, rid, proposedCategory),
		},
		{
			key: 'duplicatePurchase', label: 'duplicate purchase detection',
			run: async () => {
				const duplicatePurchase = await runPossibleDuplicatePurchase({
					invoiceId, supplierId, supplierName, restaurantId: rid,
					documentType, invoiceDate, totalAmount, lineDescriptions,
				});
				if (duplicatePurchase.linkedInvoiceId) {
					await linkRelatedDocuments(tdb, invoiceId, duplicatePurchase.linkedInvoiceId);
				}
				return duplicatePurchase.alerts;
			},
		},
	];

	const alertResultsByKey: Record<string, Alert[]> = {};
	for (const effect of alertEffects) {
		alertResultsByKey[effect.key] = await isolated(effect.label, [] as Alert[], effect.run);
	}
	const duplicatePurchaseAlerts = alertResultsByKey.duplicatePurchase;

	const verifactuVars = { fields: qrMismatches.map((m) => m.field).join(', ') };
	const verifactuAlerts: Alert[] = qrMismatches.length > 0 ? [{
		notificationType: 'verifactu_qr_mismatch',
		message: renderTemplate('es', 'notif.msg.verifactuMismatch', verifactuVars),
		payload: {
			invoiceNumber, mismatches: qrMismatches,
			messageKey: 'notif.msg.verifactuMismatch',
			messageVars: verifactuVars,
		},
	}] : [];

	await isolated('alert save', undefined, () => saveAlerts(invoiceId, rid, [
		...unitConversionAlerts, ...Object.values(alertResultsByKey).flat(), ...verifactuAlerts,
	]));

	const hasDuplicateWarning = duplicatePurchaseAlerts.some((a) => a.notificationType === 'possible_duplicate_purchase');
	if (reviewState !== 'incidencia' && hasDuplicateWarning) {
		await isolated('incidencia flip', undefined, async () => {
			await db.update(invoices)
				.set({ reviewState: 'incidencia', incidenceKind: 'documento' })
				.where(tdb.scope(invoices.restaurantId, eq(invoices.id, invoiceId)));
		});
	}

	trackEvent('invoice_saved', rid, { confidence: confidenceRaw, line_count: lineInputs.length }, invoiceId);

	void maybeSendQuotaWarning(rid);

	await isolated('extraction correction logging', undefined, () => logExtractionCorrections(
		invoiceId,
		supplierId,
		rid,
		extractedData,
		{ supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount },
		{ lineDescriptions, lineQuantities, lineUnits, lineUnitPrices, lineTotalPrices },
		productCorrections,
	));

	return isolated('onboarding flag', false, async () => {
		const onboardingRows = await db
			.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'has_completed_onboarding')))
			.limit(1);
		const isFirstInvoice = onboardingRows[0]?.value !== 'true';
		if (isFirstInvoice) {
			await db.insert(settings)
				.values({ restaurantId: rid, key: 'has_completed_onboarding', value: 'true' })
				.onConflictDoUpdate({
					target: [settings.restaurantId, settings.key],
					set: { value: 'true' },
				});
		}
		return isFirstInvoice;
	});
}

export async function saveReviewedInvoice(
	item: BatchItem | null,
	formData: FormData,
	rid: string,
	onSaved?: (tx: BatchDb) => Promise<void>,
): Promise<SaveOutcome> {
	const idemKeyRaw = formData.get('idempotency_key');
	const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;
	const tdb = forTenant(rid);
	const supplierName = (formData.get('supplier_name') as string) ?? '';
	const invoiceNumber = (formData.get('invoice_number') as string) ?? '';
	const invoiceDateRaw = formData.get('invoice_date');
	const dueDateRaw = formData.get('due_date');
	if (!isBlankOrIsoDate(invoiceDateRaw)) return { type: 'invalidDate', field: 'invoice_date' };
	if (!isBlankOrIsoDate(dueDateRaw)) return { type: 'invalidDate', field: 'due_date' };
	const invalidAmountField = findInvalidMonetaryField(formData);
	if (invalidAmountField) return { type: 'invalidAmount', field: invalidAmountField };
	const invoiceDate = toIsoDate(invoiceDateRaw);
	const dueDate = toIsoDate(dueDateRaw);
	const totalAmount = toMoneyString(formData.get('total_amount') as string | null);
	const confidenceRaw = parseAmount(formData.get('confidence'));
	const notesRaw = (formData.get('notes') as string) ?? '';
	const notes = notesRaw.slice(0, 250) || null;

	if (isLowConfidenceBlocked(item, formData)) return { type: 'lowConfidenceBlocked' };

	const extracted = item?.extractedData as ExtractedInvoice | undefined;
	const { proposedCategory, proposedContact } = resolveSupplierInfo(extracted, supplierName);

	const lineDescriptions = formData.getAll('line_descriptions') as string[];
	const lineQuantities = formData.getAll('line_quantities') as string[];
	const lineUnits = formData.getAll('line_units') as string[];
	const lineUnitPrices = formData.getAll('line_unit_prices') as string[];
	const lineTotalPrices = formData.getAll('line_total_prices') as string[];

	const { taxBase, taxBreakdown, bands: taxBands } = resolveTaxBreakdown(
		formData,
		item?.extractedData ?? undefined,
	);

	const contentHash = computeFormContentHash(
		{ supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount },
		formData,
		taxBands,
	);

	const extractedData = item?.extractedData ?? undefined;
	const rawDocumentType = formData.has('document_type') ? formData.get('document_type') : extractedData?.document_type;
	const documentType = rawDocumentType === 'factura' || rawDocumentType === 'albaran' ? rawDocumentType : null;
	const primaryFile = item?.fileKey ?? null;

	const rawQrUrl = typeof extractedData?.qr_url === 'string' ? extractedData.qr_url : null;
	const qrResult = rawQrUrl ? parseQrUrl(rawQrUrl) : null;
	const qrMismatches = detectVerifactuMismatch(qrResult, {
		invoice_number: invoiceNumber || null,
		invoice_date: invoiceDate,
		total_amount: totalAmount == null ? null : moneyToNumber(totalAmount),
	});

	const lineInputs = parseLineInputs(formData);
	const enrichedLines = await enrichLineItems(rid, supplierName, lineInputs);

	const { reviewState, incidenceKind } = resolveReviewState({
		lowConfidenceAcked: formData.get('low_confidence_ack') === 'true',
		totalMismatch: detectTotalMismatch(lineInputs, taxBands, totalAmount) || extractedData?.total_mismatch === true,
		conversionNeeded: enrichedLines.some((l) => l.requiresUnitConversion),
		qrMismatch: qrMismatches.length > 0,
	});

	let supplierId = 0;
	let invoiceId: number | null = null;
	let duplicateOutcome: Extract<SaveOutcome, { type: 'contentDuplicate' | 'numberDuplicate' }> | null = null;
	let isReplay = false;
	const savedItems: EnrichedLineItem[] = [];
	const unitConversionAlerts: Alert[] = [];

	await db.transaction(async (tx) => {
		if (idemKey && !(await claimRequest(idemKey, rid, tx))) {
			isReplay = true;
			return;
		}

		const hashDuplicateId = await findContentHashDuplicate(tx, tdb, contentHash);
		if (hashDuplicateId !== null) {
			duplicateOutcome = { type: 'contentDuplicate', duplicateId: hashDuplicateId };
			if (idemKey) await releaseRequest(idemKey, tx);
			return;
		}

		supplierId = await getOrCreateSupplierId(rid, supplierName, tx, proposedCategory, proposedContact);

		const outstandingBalance = typeof extracted?.outstanding_balance === 'number' ? String(extracted.outstanding_balance) : null;
		if (outstandingBalance !== null) {
			await tx.update(suppliers).set({ outstandingBalance }).where(eq(suppliers.id, supplierId));
		}

		if (invoiceNumber.trim() && await invoiceNumberTaken(tx, tdb, supplierId, invoiceNumber.trim())) {
			duplicateOutcome = { type: 'numberDuplicate' };
			if (idemKey) await releaseRequest(idemKey, tx);
			return;
		}

		const insertedInvoice = await tx
			.insert(invoices)
			.values({
				restaurantId: rid,
				supplierId,
				invoiceNumber: invoiceNumber || null,
				documentType,
				invoiceDate,
				dueDate,
				totalAmount,
				taxBase,
				taxBreakdown,
				status: 'pending',
				reviewState,
				incidenceKind,
				sourceFile: primaryFile,
				confidence: confidenceRaw,
				contentHash,
				notes,
				qrUrl: qrResult?.url ?? null,
				qrMismatch: qrMismatches.length > 0,
			})
			.onConflictDoNothing()
			.returning({ id: invoices.id });

		if (!insertedInvoice.length) {
			const raceHashDuplicateId = await findContentHashDuplicate(tx, tdb, contentHash);
			duplicateOutcome = raceHashDuplicateId !== null
				? { type: 'contentDuplicate', duplicateId: raceHashDuplicateId }
				: { type: 'numberDuplicate' };
			if (idemKey) await releaseRequest(idemKey, tx);
			return;
		}
		invoiceId = insertedInvoice[0].id;

		await insertEnrichedLines(tx, { invoiceId: invoiceId!, rid, supplierId, supplierName }, enrichedLines, savedItems, unitConversionAlerts);

		if (onSaved) await onSaved(tx);
	});

	if (isReplay) return { type: 'replay' };

	if (duplicateOutcome) {
		trackEvent('duplicate_detected', rid, { supplier: supplierName, amount: totalAmount });
		return duplicateOutcome;
	}

	const isFirstInvoice = await runPostSaveEffects({
		invoiceId: invoiceId!, supplierId, rid, supplierName, invoiceNumber, invoiceDate, dueDate,
		totalAmount, documentType, confidenceRaw, lineInputs, savedItems, unitConversionAlerts,
		qrMismatches, extractedData, lineDescriptions, lineQuantities, lineUnits, lineUnitPrices,
		lineTotalPrices, proposedCategory, reviewState, tdb,
	});

	return { type: 'saved', invoiceId: invoiceId!, isFirstInvoice };
}
