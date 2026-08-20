import { computeInvoiceContentHash } from './dedup';
import { db, forTenant } from './db';
import { invoices, invoiceLineItems, extractionCorrections, settings, suppliers } from './schema';
import { eq, and, isNull } from 'drizzle-orm';
import { resolveUnit, resolveLineProducts, parsePack, normalizedUnitPrice } from './products';
import { enqueueNormalize } from './queue';
import { normalizeProductKey, isSameSupplierName } from './normalize';
import { runPriceShock, runStockForecast, runBudgetCheck, runCategorizationNudge, runCategorySuggestion, runPossibleDuplicatePurchase, saveAlerts, type Alert } from './alerts';
import { getTierFeatures } from './billing';
import { maybeSendQuotaWarning } from './quota-warning';
import { trackEvent } from './events';
import { claimRequest, releaseRequest, isValidKey } from './idempotency';
import { getOrCreateSupplierId, type SupplierContactInfo } from './supplier';
import { resolveSupplierCategory, UNCATEGORIZED_CATEGORY } from '$lib/constants';
import type { EnrichedLineItem, PackInfo } from './products';
import type { ExtractedInvoice } from './extract';
import type { BatchDb, BatchItem } from './batch-core';
import { parseQrUrl, detectVerifactuMismatch } from './qr';
import { toMoneyString, moneyToNumber } from './money';
import { isBlankOrIsoDate, toIsoDate } from './dates';

export type SaveOutcome =
	| { type: 'lowConfidenceBlocked' }
	| { type: 'invalidDate'; field: 'invoice_date' | 'due_date' }
	| { type: 'contentDuplicate'; duplicateId: number }
	| { type: 'numberDuplicate' }
	| { type: 'replay' }
	| { type: 'saved'; invoiceId: number; isFirstInvoice: boolean };

function toFloat(value: unknown): number | null {
	if (!value) return null;
	const n = parseFloat(String(value));
	return isNaN(n) ? null : n;
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
	const n = parseFloat(String(v ?? ''));
	return isNaN(n) ? '' : n.toString();
}

async function logExtractionCorrections(
	invoiceId: number,
	supplierId: number,
	restaurantId: string,
	originalData: Record<string, unknown> | undefined,
	submitted: HeaderSnapshot,
	submittedLines: LineSnapshot,
) {
	if (!originalData) return;

	type CorrectionRow = typeof extractionCorrections.$inferInsert;
	const rows: CorrectionRow[] = [];

	const headerComparisons: Array<{ field: string; origRaw: unknown; submittedVal: string; numeric?: boolean }> = [
		{ field: 'supplier_name',  origRaw: originalData.supplier_name,  submittedVal: submitted.supplierName },
		{ field: 'invoice_number', origRaw: originalData.invoice_number, submittedVal: submitted.invoiceNumber },
		{ field: 'invoice_date',   origRaw: originalData.invoice_date,   submittedVal: submitted.invoiceDate ?? '' },
		{ field: 'due_date',       origRaw: originalData.due_date,       submittedVal: submitted.dueDate ?? '' },
		{ field: 'total_amount',   origRaw: originalData.total_amount,   submittedVal: String(submitted.totalAmount ?? ''), numeric: true },
	];

	for (const { field, origRaw, submittedVal, numeric } of headerComparisons) {
		const orig = numeric ? normalizeNum(origRaw) : normalizeStr(origRaw);
		const sub  = numeric ? normalizeNum(submittedVal) : normalizeStr(submittedVal);
		if (orig !== sub) {
			rows.push({ invoiceId, supplierId, restaurantId, fieldName: field, originalValue: orig || null, correctedValue: sub || null, lineItemIndex: null });
		}
	}

	const originalLines = Array.isArray(originalData.line_items)
		? (originalData.line_items as Array<Record<string, unknown>>)
		: [];

	const { lineDescriptions, lineQuantities, lineUnits, lineUnitPrices, lineTotalPrices } = submittedLines;
	const compareCount = Math.min(lineDescriptions.length, originalLines.length);

	for (let i = 0; i < compareCount; i++) {
		const orig = originalLines[i];
		const lineFields: Array<{ field: string; origRaw: unknown; subVal: string; numeric?: boolean }> = [
			{ field: 'line_item.description', origRaw: orig.description, subVal: lineDescriptions[i] ?? '' },
			{ field: 'line_item.quantity',    origRaw: orig.quantity,    subVal: lineQuantities[i] ?? '',    numeric: true },
			{ field: 'line_item.unit',        origRaw: orig.unit,        subVal: lineUnits[i] ?? '' },
			{ field: 'line_item.unit_price',  origRaw: orig.unit_price,  subVal: lineUnitPrices[i] ?? '',   numeric: true },
			{ field: 'line_item.total_price', origRaw: orig.total_price, subVal: lineTotalPrices[i] ?? '',  numeric: true },
		];
		for (const { field, origRaw, subVal, numeric } of lineFields) {
			const o = numeric ? normalizeNum(origRaw) : normalizeStr(origRaw);
			const s = numeric ? normalizeNum(subVal)  : normalizeStr(subVal);
			if (o !== s) {
				rows.push({ invoiceId, supplierId, restaurantId, fieldName: field, originalValue: o || null, correctedValue: s || null, lineItemIndex: i });
			}
		}
	}

	if (rows.length > 0) {
		await db.insert(extractionCorrections).values(rows);
		trackEvent('invoice_corrected', restaurantId, {
			field_count: rows.length,
			fields: rows.map((r) => r.fieldName),
		}, invoiceId);
	}
}

export type LineFormInput = {
	desc: string;
	qtyFloat: number | null;
	unitPriceFloat: number | null;
	unitVal: string | null;
	totalPriceVal: number | null;
	taxRateVal: number | null;
	pack: PackInfo | null;
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
): string {
	const descriptions = formData.getAll('line_descriptions').map(String);
	const quantities   = formData.getAll('line_quantities').map(String);
	const units        = formData.getAll('line_units').map(String);
	const unitPrices   = formData.getAll('line_unit_prices').map(String);
	const totalPrices  = formData.getAll('line_total_prices').map(String);

	const nonEmptyDescs = descriptions.filter(d => d.trim());
	return computeInvoiceContentHash({
		...header,
		lineDescriptions: nonEmptyDescs,
		lineQuantities:   nonEmptyDescs.map((_, i) => toFloat(quantities[i])),
		lineUnits:        nonEmptyDescs.map((_, i) => units[i]?.trim() || null),
		lineUnitPrices:   nonEmptyDescs.map((_, i) => toMoneyString(unitPrices[i])),
		lineTotalPrices:  nonEmptyDescs.map((_, i) => toMoneyString(totalPrices[i])),
	});
}

export function parseLineInputs(formData: FormData): LineFormInput[] {
	const descriptions = formData.getAll('line_descriptions').map(String);
	const quantities   = formData.getAll('line_quantities').map(String);
	const units        = formData.getAll('line_units').map(String);
	const unitPrices   = formData.getAll('line_unit_prices').map(String);
	const totalPrices  = formData.getAll('line_total_prices').map(String);
	const taxRates     = formData.getAll('line_tax_rates').map(String);

	const out: LineFormInput[] = [];
	for (let i = 0; i < descriptions.length; i++) {
		const desc = descriptions[i].trim();
		if (!desc) continue;
		const unitVal = units[i]?.trim() || null;
		out.push({
			desc,
			qtyFloat: toFloat(quantities[i]),
			unitPriceFloat: toFloat(unitPrices[i]),
			unitVal,
			totalPriceVal: toFloat(totalPrices[i]),
			taxRateVal: toFloat(taxRates[i]),
			pack: parsePack(desc, unitVal),
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
				requiresUnitConversion: requiresConv ? 1 : 0,
				canonicalUnit,
				unitsPerPack: pack?.unitsPerPack ?? null,
				unitSize: pack?.unitSize ?? null,
				sizeUnit: pack?.sizeUnit ?? null,
				baseUnit: pack?.baseUnit ?? null,
				normalizedUnitPrice: toMoneyString(normalizedUnitPrice(li.unitPriceFloat, pack)),
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

export async function linkProductsToInvoice(
	invoiceId: number,
	supplierId: number,
	rid: string,
	lineInputs: Array<{ desc: string; unitVal: string | null; pack: PackInfo | null }>,
): Promise<Map<string, number>> {
	const productByKey = new Map<string, number>();
	try {
		const [supplier] = await db
			.select({ category: suppliers.category })
			.from(suppliers)
			.where(forTenant(rid).scope(suppliers.restaurantId, eq(suppliers.id, supplierId)))
			.limit(1);
		const category = supplier?.category ?? null;

		const resolved = await resolveLineProducts(
			db, rid, supplierId,
			lineInputs.map(li => ({
				description: li.desc,
				unit: li.unitVal,
				category,
				unitsPerPack: li.pack?.unitsPerPack ?? null,
				baseUnit: li.pack?.baseUnit ?? null,
			})),
		);

		const suggestions: Alert[] = [];
		for (const [desc, r] of resolved) {
			await db.update(invoiceLineItems)
				.set({ productId: r.productId })
				.where(and(
					forTenant(rid).scope(invoiceLineItems.restaurantId),
					eq(invoiceLineItems.invoiceId, invoiceId),
					eq(invoiceLineItems.description, desc),
				));
			productByKey.set(normalizeProductKey(desc), r.productId);

			if (r.status === 'fuzzy' && r.suggestion) {
				suggestions.push({
					notificationType: 'product_suggestion',
					message: `product_suggestion: ${desc} ~ ${r.suggestion.candidateName}`,
					payload: {
						description: desc,
						productId: r.productId,
						candidateName: r.suggestion.candidateName,
						candidateProductId: r.suggestion.candidateProductId,
						score: Math.round(r.suggestion.score * 100) / 100,
						messageKey: 'notif.msg.productSuggestion',
						messageVars: { description: desc, candidateName: r.suggestion.candidateName },
					},
				});
			} else if (r.status === 'created') {
				await enqueueNormalize(rid, r.productId, desc).catch((e) =>
					console.error('[invoice-save] normalize enqueue failed (non-fatal):', e));
			}
		}
		if (suggestions.length > 0) await saveAlerts(invoiceId, rid, suggestions);
	} catch (err) {
		console.error('[invoice-save] product linking failed (non-fatal):', err);
	}
	return productByKey;
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
	const invoiceDate = toIsoDate(invoiceDateRaw);
	const dueDate = toIsoDate(dueDateRaw);
	const totalAmount = toMoneyString(formData.get('total_amount') as string | null);
	const confidenceRaw = toFloat(formData.get('confidence'));
	const notesRaw = (formData.get('notes') as string) ?? '';
	const notes = notesRaw.slice(0, 250) || null;

	const lowConfAck = formData.get('low_confidence_ack') === 'true';
	if (!lowConfAck) {
		const extractedData = item?.extractedData ?? undefined;
		const fieldConfs = (extractedData?.field_confidences as Record<string, number> | undefined) ?? {};
		const HEADER_FIELDS = ['supplier_name', 'invoice_number', 'invoice_date', 'due_date', 'total_amount'];
		const hasLowConf = HEADER_FIELDS.some(f => fieldConfs[f] != null && fieldConfs[f] < 0.85);
		const overallConf = typeof extractedData?.confidence === 'number' ? extractedData.confidence : 1;
		if (hasLowConf || overallConf < 0.85) {
			return { type: 'lowConfidenceBlocked' };
		}
	}

	const extracted = item?.extractedData as ExtractedInvoice | undefined;
	const sameSupplier =
		typeof extracted?.supplier_name === 'string' &&
		isSameSupplierName(extracted.supplier_name, supplierName);
	const proposedCategory = sameSupplier
		? resolveSupplierCategory(extracted?.supplier_category, extracted?.field_confidences?.supplier_category)
		: UNCATEGORIZED_CATEGORY;
	const proposedContact: SupplierContactInfo = sameSupplier
		? {
			cif: extracted?.supplier_nif ?? null,
			email: extracted?.supplier_email ?? null,
			phone: extracted?.supplier_phone ?? null,
			address: extracted?.supplier_address ?? null,
		}
		: {};

	const lineDescriptions = formData.getAll('line_descriptions') as string[];
	const lineQuantities = formData.getAll('line_quantities') as string[];
	const lineUnits = formData.getAll('line_units') as string[];
	const lineUnitPrices = formData.getAll('line_unit_prices') as string[];
	const lineTotalPrices = formData.getAll('line_total_prices') as string[];

	const contentHash = computeFormContentHash(
		{ supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount },
		formData,
	);

	const hashMatch = await db
		.select({ id: invoices.id })
		.from(invoices)
		.where(and(tdb.scope(invoices.restaurantId), eq(invoices.contentHash, contentHash), isNull(invoices.deletedAt)))
		.limit(1);

	if (hashMatch.length > 0) {
		return { type: 'contentDuplicate', duplicateId: hashMatch[0].id };
	}

	const extractedData = item?.extractedData ?? undefined;
	const taxBase = toMoneyString(extractedData?.tax_base as string | number | null | undefined);
	const taxBreakdownRaw = extractedData?.tax_breakdown;
	const taxBreakdown = Array.isArray(taxBreakdownRaw) ? JSON.stringify(taxBreakdownRaw) : null;
	const rawDocumentType = extractedData?.document_type;
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

	let supplierId = 0;
	let invoiceId: number | null = null;
	let isDuplicate = false;
	let isReplay = false;
	const savedItems: EnrichedLineItem[] = [];
	const unitConversionAlerts: Array<{ notificationType: string; message: string; payload: Record<string, unknown> }> = [];

	await db.transaction(async (tx) => {
		if (idemKey && !(await claimRequest(idemKey, rid, tx))) {
			isReplay = true;
			return;
		}

		supplierId = await getOrCreateSupplierId(rid, supplierName, tx, proposedCategory, proposedContact);

		if (invoiceNumber.trim()) {
			const dup = await tx
				.select({ id: invoices.id })
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.supplierId, supplierId), eq(invoices.invoiceNumber, invoiceNumber.trim())))
				.limit(1);
			if (dup.length > 0) {
				isDuplicate = true;
				if (idemKey) await releaseRequest(idemKey, tx);
				return;
			}
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
				sourceFile: primaryFile,
				confidence: confidenceRaw,
				contentHash,
				notes,
				qrUrl: qrResult?.url ?? null,
				qrMismatch: qrMismatches.length > 0 ? 1 : 0,
			})
			.onConflictDoNothing()
			.returning({ id: invoices.id });

		if (!insertedInvoice.length) {
			isDuplicate = true;
			if (idemKey) await releaseRequest(idemKey, tx);
			return;
		}
		invoiceId = insertedInvoice[0].id;

		for (const line of enrichedLines) {
			const li = line.input;

			await tx.insert(invoiceLineItems).values({
				invoiceId: invoiceId!,
				restaurantId: rid,
				...line.columns,
			});

			savedItems.push(line.item);

			if (line.requiresUnitConversion) {
				unitConversionAlerts.push({
					notificationType: 'unit_conversion_needed',
					message: `unit_conversion_needed: ${li.desc} ${li.qtyFloat ?? '?'} ${li.unitVal}`,
					payload: {
						supplierId, supplierName, ingredient: li.desc, purchaseUnit: li.unitVal, quantity: li.qtyFloat,
						messageKey: 'notif.msg.unitConversion',
						messageVars: { ingredient: li.desc, quantity: li.qtyFloat ?? '?', unit: li.unitVal },
					},
				});
			}
		}

		if (onSaved) await onSaved(tx);
	});

	if (isReplay) return { type: 'replay' };

	if (isDuplicate) {
		trackEvent('duplicate_detected', rid, { supplier: supplierName, amount: totalAmount });
		return { type: 'numberDuplicate' };
	}

	let isFirstInvoice = false;
	try {
		const productByKey = await linkProductsToInvoice(invoiceId!, supplierId, rid, lineInputs);

		const priceAlerts = await runPriceShock(invoiceId!, supplierName, savedItems, rid, productByKey);
		const { stockTracking } = await getTierFeatures(rid);
		const stockAlerts = stockTracking ? await runStockForecast(savedItems, rid) : [];
		const budgetAlerts = await runBudgetCheck(invoiceId!, supplierId, rid);
		const categoryAlerts = await runCategorizationNudge(invoiceId!, supplierId, rid);
		const categorySuggestions = await runCategorySuggestion(supplierId, rid, proposedCategory);
		const duplicatePurchaseAlerts = await runPossibleDuplicatePurchase(
			invoiceId!, supplierId, supplierName, rid, documentType, invoiceDate, totalAmount,
		);
		const verifactuAlerts: Alert[] = qrMismatches.length > 0 ? [{
			notificationType: 'verifactu_qr_mismatch',
			message: `verifactu_qr_mismatch: ${qrMismatches.map((m) => m.field).join(', ')}`,
			payload: {
				invoiceNumber, mismatches: qrMismatches,
				messageKey: 'notif.msg.verifactuMismatch',
				messageVars: { fields: qrMismatches.map((m) => m.field).join(', ') },
			},
		}] : [];
		await saveAlerts(invoiceId!, rid, [
			...unitConversionAlerts, ...priceAlerts, ...stockAlerts, ...budgetAlerts,
			...categoryAlerts, ...categorySuggestions, ...duplicatePurchaseAlerts, ...verifactuAlerts,
		]);

		trackEvent('invoice_saved', rid, { confidence: confidenceRaw, line_count: lineInputs.length }, invoiceId);

		void maybeSendQuotaWarning(rid);

		await logExtractionCorrections(
			invoiceId!,
			supplierId,
			rid,
			extractedData,
			{ supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount },
			{ lineDescriptions, lineQuantities, lineUnits, lineUnitPrices, lineTotalPrices },
		);

		const onboardingRows = await db
			.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'has_completed_onboarding')))
			.limit(1);
		isFirstInvoice = onboardingRows[0]?.value !== 'true';
		if (isFirstInvoice) {
			await db.insert(settings)
				.values({ restaurantId: rid, key: 'has_completed_onboarding', value: 'true' })
				.onConflictDoUpdate({
					target: [settings.restaurantId, settings.key],
					set: { value: 'true' },
				});
		}
	} catch (err) {
		console.error('[invoice-save] post-commit side effects failed (non-fatal):', err);
	}

	return { type: 'saved', invoiceId: invoiceId!, isFirstInvoice };
}
