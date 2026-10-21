import { db, forTenant } from './db';
import { invoices, invoiceLineItems, extractionCorrections, settings } from './schema';
import { eq, and, inArray, notInArray } from 'drizzle-orm';
import { resolveLineProducts, applyExtractedAllergens, assignLineProduct, getProductName, type EnrichedLineItem, type PackInfo } from './products';
import { enqueueCategorize, enqueueNormalize } from './queue';
import { normalizeProductKey } from './normalize';
import { runPriceShock, runStockForecast, runBudgetCheck, runCategorizationNudge, runCategorySuggestion, runPossibleDuplicatePurchase, runLineItemReconciliation, saveAlerts, type Alert } from './alerts';
import { getTierFeatures } from './billing';
import { maybeSendQuotaWarning } from './quota-warning';
import { trackEvent } from './events';
import { runDetached } from './tenant-context';
import { parseAmount } from './money';
import { renderTemplate } from '$lib/i18n-messages';
import { detectVerifactuMismatch } from './qr';
import type { ExtractedInvoice } from './contracts/extraction-contract.js';
import type { ProfileMismatch } from './invoice-persist';
import type { LineFormInput } from './invoice-form';
import type { ReviewState } from '$lib/status';

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
		if (!orig) continue;
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
		await trackEvent('invoice_corrected', restaurantId, {
			field_count: rows.length,
			fields: rows.map((r) => r.fieldName),
		}, invoiceId);
	}
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
	requestId?: string,
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
			} else if (r.status === 'pending' && r.suggestion && !reassigned) {
				const productSuggestionVars = { description: desc, candidateName: r.suggestion.candidateName };
				suggestions.push({
					notificationType: 'product_suggestion',
					message: renderTemplate('es', 'notif.msg.productSuggestion', productSuggestionVars),
					payload: {
						description: desc,
						productId: r.productId,
						candidateName: r.suggestion.candidateName,
						candidateProductId: r.suggestion.candidateProductId,
						score: Math.round(r.suggestion.score * 100) / 100,
						source: 'fuzzy_pending',
						messageKey: 'notif.msg.productSuggestion',
						messageVars: productSuggestionVars,
					},
				});
				await enqueueCategorize(rid, productId, desc, requestId).catch((e) =>
					console.error('[invoice-save] categorize enqueue failed (non-fatal):', e));
			} else if (r.status === 'created' && !reassigned) {
				await enqueueNormalize(rid, productId, desc, requestId).catch((e) =>
					console.error('[invoice-save] normalize enqueue failed (non-fatal):', e));
				await enqueueCategorize(rid, productId, desc, requestId).catch((e) =>
					console.error('[invoice-save] categorize enqueue failed (non-fatal):', e));
			}
		}
		if (suggestions.length > 0) await saveAlerts(invoiceId, rid, suggestions);
	} catch (err) {
		console.error('[invoice-save] product linking failed (non-fatal):', err);
	}
	return { productByKey, productCorrections };
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

export async function runPostSaveEffects(params: {
	invoiceId: number;
	supplierId: number;
	rid: string;
	supplierName: string;
	invoiceNumber: string;
	invoiceDate: string | null;
	dueDate: string | null;
	totalAmount: string | null;
	documentType: 'factura' | 'albaran' | null;
	purchaseOrder: string | null;
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
	restaurantPhoneMismatch: ProfileMismatch | null;
	restaurantTaxIdMismatch: ProfileMismatch | null;
	requestId?: string;
}): Promise<boolean> {
	const { invoiceId, supplierId, rid, supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount, documentType, purchaseOrder, confidenceRaw, lineInputs, savedItems, unitConversionAlerts, qrMismatches, extractedData, lineDescriptions, lineQuantities, lineUnits, lineUnitPrices, lineTotalPrices, proposedCategory, reviewState, tdb, restaurantPhoneMismatch, restaurantTaxIdMismatch, requestId } = params;

	const { productByKey, productCorrections } = await isolated(
		'product linking',
		{ productByKey: new Map<string, number>(), productCorrections: [] as ProductCorrection[] },
		() => linkProductsToInvoice(
			invoiceId, supplierId, rid, lineInputs,
			extractedAllergensByKey(extractedData as ExtractedInvoice | undefined),
			requestId,
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
					documentType, invoiceDate, totalAmount, lineDescriptions, purchaseOrder,
				});
				if (duplicatePurchase.linkedInvoiceId) {
					await linkRelatedDocuments(tdb, invoiceId, duplicatePurchase.linkedInvoiceId);
				}
				return duplicatePurchase.alerts;
			},
		},
		{
			key: 'lineItemReconciliation', label: 'line item reconciliation',
			run: () => runLineItemReconciliation(invoiceId, rid),
		},
	];

	const alertResultsByKey: Record<string, Alert[]> = {};
	for (const effect of alertEffects) {
		alertResultsByKey[effect.key] = await isolated(effect.label, [] as Alert[], effect.run);
	}
	const duplicatePurchaseAlerts = alertResultsByKey['duplicatePurchase'] ?? [];

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

	const profileMismatchAlerts: Alert[] = [
		{ mismatch: restaurantPhoneMismatch, type: 'restaurant_phone_mismatch', key: 'notif.msg.restaurantPhoneMismatch' },
		{ mismatch: restaurantTaxIdMismatch, type: 'restaurant_tax_id_mismatch', key: 'notif.msg.restaurantTaxIdMismatch' },
	].flatMap(({ mismatch, type, key }) => {
		if (!mismatch) return [];
		const vars = { current: mismatch.current, extracted: mismatch.extracted };
		return [{
			notificationType: type,
			message: renderTemplate('es', key, vars),
			payload: { ...vars, messageKey: key, messageVars: vars },
		}];
	});

	await isolated('alert save', undefined, () => saveAlerts(invoiceId, rid, [
		...unitConversionAlerts, ...Object.values(alertResultsByKey).flat(), ...verifactuAlerts, ...profileMismatchAlerts,
	]));

	const hasDuplicateWarning = duplicatePurchaseAlerts.some((a) => a.notificationType === 'possible_duplicate_purchase');
	if (reviewState !== 'incidencia' && hasDuplicateWarning) {
		await isolated('incidencia flip', undefined, async () => {
			await db.update(invoices)
				.set({ reviewState: 'incidencia', incidenceKind: 'documento', incidenceReasons: ['duplicate_purchase'] })
				.where(tdb.scope(invoices.restaurantId, eq(invoices.id, invoiceId)));
		});
	}

	await trackEvent('invoice_saved', rid, { confidence: confidenceRaw, line_count: lineInputs.length }, invoiceId);

	runDetached(rid, () => maybeSendQuotaWarning(rid))
		.catch((e) => console.error('[invoice-save] quota warning failed (non-fatal):', e));

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
