import { computeInvoiceContentHash } from './dedup';
import { db, forTenant } from './db';
import { invoices, invoiceLineItems, extractionCorrections, settings, suppliers } from './schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { resolveUnit, resolveLineProducts, parsePack, normalizedUnitPrice } from './products';
import { enqueueNormalize } from './queue';
import { normalizeProductKey, isSameSupplierName } from './normalize';
import { runPriceShock, runStockForecast, runBudgetCheck, runCategorizationNudge, runCategorySuggestion, runPossibleDuplicatePurchase, saveAlerts, type Alert } from './alerts';
import { getTierFeatures } from './billing';
import { maybeSendQuotaWarning } from './quota-warning';
import { trackEvent } from './events';
import { claimRequest, releaseRequest, isValidKey } from './idempotency';
import { getOrCreateSupplierId, findSupplierMatch, type SupplierContactInfo } from './supplier';
import { resolveSupplierCategory, UNCATEGORIZED_CATEGORY } from '$lib/constants';
import type { EnrichedLineItem, PackInfo } from './products';
import type { ExtractedInvoice } from './extract';
import type { BatchDb, BatchItem } from './batch-core';
import { parseQrUrl, detectVerifactuMismatch } from './qr';
import { toMoneyString, moneyToNumber } from './money';
import { isBlankOrIsoDate, toIsoDate } from './dates';

export interface PendingAlbaranCandidate {
	invoiceId: number;
	invoiceNumber: string | null;
	invoiceDate: string | null;
	lineCount: number;
}

export type SaveOutcome =
	| { type: 'lowConfidenceBlocked' }
	| { type: 'newSupplierBlocked'; supplierName: string }
	| { type: 'mergeCandidate'; candidate: PendingAlbaranCandidate }
	| { type: 'invalidDate'; field: 'invoice_date' | 'due_date' }
	| { type: 'contentDuplicate'; duplicateId: number }
	| { type: 'numberDuplicate' }
	| { type: 'replay' }
	| { type: 'saved'; invoiceId: number; isFirstInvoice: boolean };

const PENDING_ALBARAN_DATE_WINDOW_DAYS = 21;

/**
 * A "pending" albaran is one saved without prices (see field.pendingPricing):
 * at least one line has both unit_price and total_price still null. When a
 * factura from the same supplier lands close in time, it's very likely the
 * priced follow-up for that same delivery rather than a separate purchase.
 */
async function findPendingAlbaranCandidate(
	rid: string,
	supplierId: number,
	invoiceDate: string,
): Promise<PendingAlbaranCandidate | null> {
	const rows = await db.execute<{ id: number; invoice_number: string | null; invoice_date: string | null; line_count: number }>(sql`
		SELECT i.id, i.invoice_number, i.invoice_date,
		       (SELECT count(*)::int FROM invoice_line_items p
		        WHERE p.invoice_id = i.id AND p.unit_price IS NULL AND p.total_price IS NULL) AS line_count
		FROM invoices i
		WHERE i.restaurant_id = ${rid}
		  AND i.supplier_id = ${supplierId}
		  AND i.document_type = 'albaran'
		  AND i.deleted_at IS NULL
		  AND i.invoice_date IS NOT NULL
		  AND ABS(i.invoice_date - ${invoiceDate}::date) <= ${PENDING_ALBARAN_DATE_WINDOW_DAYS}
		  AND EXISTS (
		    SELECT 1 FROM invoice_line_items p
		    WHERE p.invoice_id = i.id AND p.unit_price IS NULL AND p.total_price IS NULL
		  )
		ORDER BY ABS(i.invoice_date - ${invoiceDate}::date) ASC
		LIMIT 1
	`);
	if (rows.length === 0) return null;
	const r = rows[0];
	return { invoiceId: r.id, invoiceNumber: r.invoice_number, invoiceDate: r.invoice_date, lineCount: r.line_count };
}

async function isPendingAlbaran(rid: string, invoiceId: number, supplierId: number): Promise<boolean> {
	const rows = await db.execute<{ id: number }>(sql`
		SELECT i.id FROM invoices i
		WHERE i.id = ${invoiceId} AND i.restaurant_id = ${rid} AND i.supplier_id = ${supplierId}
		  AND i.document_type = 'albaran' AND i.deleted_at IS NULL
		  AND EXISTS (
		    SELECT 1 FROM invoice_line_items p
		    WHERE p.invoice_id = i.id AND p.unit_price IS NULL AND p.total_price IS NULL
		  )
		LIMIT 1
	`);
	return rows.length > 0;
}

/**
 * Backfills prices from a just-arrived factura onto the pending albaran's own
 * line items (matched by normalized description) instead of inserting a
 * second, duplicate document. Lines with no match are appended.
 */
async function mergeLinesIntoAlbaran(
	tx: BatchDb,
	rid: string,
	albaranInvoiceId: number,
	enrichedLines: EnrichedLine[],
): Promise<EnrichedLineItem[]> {
	const existing = await tx
		.select({ id: invoiceLineItems.id, description: invoiceLineItems.description, unitPrice: invoiceLineItems.unitPrice, totalPrice: invoiceLineItems.totalPrice })
		.from(invoiceLineItems)
		.where(and(forTenant(rid).scope(invoiceLineItems.restaurantId), eq(invoiceLineItems.invoiceId, albaranInvoiceId)));

	const pendingIdByKey = new Map<string, number>();
	for (const row of existing) {
		if (row.unitPrice == null && row.totalPrice == null) {
			const key = normalizeProductKey(row.description ?? '');
			if (key && !pendingIdByKey.has(key)) pendingIdByKey.set(key, row.id);
		}
	}

	const savedItems: EnrichedLineItem[] = [];
	for (const line of enrichedLines) {
		const key = normalizeProductKey(line.input.desc);
		const targetId = pendingIdByKey.get(key);
		if (targetId != null) {
			await tx.update(invoiceLineItems).set(line.columns).where(eq(invoiceLineItems.id, targetId));
			pendingIdByKey.delete(key);
		} else {
			await tx.insert(invoiceLineItems).values({ invoiceId: albaranInvoiceId, restaurantId: rid, ...line.columns });
		}
		savedItems.push(line.item);
	}
	return savedItems;
}

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
	userId: string | null,
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
			rows.push({ invoiceId, supplierId, restaurantId, userId, fieldName: field, originalValue: orig || null, correctedValue: sub || null, lineItemIndex: null });
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
				rows.push({ invoiceId, supplierId, restaurantId, userId, fieldName: field, originalValue: o || null, correctedValue: s || null, lineItemIndex: i });
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
		dueDate?: string | null;
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
	userId: string | null = null,
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

	const newSupplierAck = formData.get('new_supplier_ack') === 'true';
	let existingSupplierId: number | null = null;
	if (supplierName.trim()) {
		const existingSupplier = await findSupplierMatch(rid, supplierName, proposedContact.cif);
		if (!existingSupplier && !newSupplierAck) {
			return { type: 'newSupplierBlocked', supplierName: supplierName.trim() };
		}
		existingSupplierId = existingSupplier?.id ?? null;
	}

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

	const mergeAck = formData.get('merge_ack') === 'true';
	const mergeRejected = formData.get('merge_rejected') === 'true';
	let mergeTargetId: number | null = null;
	if (documentType === 'factura' && existingSupplierId != null && invoiceDate) {
		if (mergeAck) {
			const requestedId = toFloat(formData.get('merge_candidate_id'));
			if (requestedId != null && await isPendingAlbaran(rid, requestedId, existingSupplierId)) {
				mergeTargetId = requestedId;
			}
		} else if (!mergeRejected) {
			const candidate = await findPendingAlbaranCandidate(rid, existingSupplierId, invoiceDate);
			if (candidate) return { type: 'mergeCandidate', candidate };
		}
	}

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
	let wasMerged = false;
	const savedItems: EnrichedLineItem[] = [];
	const unitConversionAlerts: Array<{ notificationType: string; message: string; payload: Record<string, unknown> }> = [];

	for (const line of enrichedLines) {
		const li = line.input;
		if (line.requiresUnitConversion) {
			unitConversionAlerts.push({
				notificationType: 'unit_conversion_needed',
				message: `unit_conversion_needed: ${li.desc} ${li.qtyFloat ?? '?'} ${li.unitVal}`,
				payload: {
					supplierName, ingredient: li.desc, purchaseUnit: li.unitVal, quantity: li.qtyFloat,
					messageKey: 'notif.msg.unitConversion',
					messageVars: { ingredient: li.desc, quantity: li.qtyFloat ?? '?', unit: li.unitVal },
				},
			});
		}
	}

	await db.transaction(async (tx) => {
		if (idemKey && !(await claimRequest(idemKey, rid, tx))) {
			isReplay = true;
			return;
		}

		if (mergeTargetId != null) {
			supplierId = existingSupplierId!;
			invoiceId = mergeTargetId;
			wasMerged = true;

			await tx.update(invoices)
				.set({
					documentType: 'factura',
					invoiceNumber: invoiceNumber || null,
					totalAmount,
					taxBase,
					taxBreakdown,
					contentHash,
					confidence: confidenceRaw,
					qrUrl: qrResult?.url ?? null,
					qrMismatch: qrMismatches.length > 0 ? 1 : 0,
				})
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, mergeTargetId)));

			savedItems.push(...await mergeLinesIntoAlbaran(tx, rid, mergeTargetId, enrichedLines));
		} else {
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
				await tx.insert(invoiceLineItems).values({
					invoiceId: invoiceId!,
					restaurantId: rid,
					...line.columns,
				});
				savedItems.push(line.item);
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
		const duplicatePurchaseAlerts = wasMerged ? [] : await runPossibleDuplicatePurchase(
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

		trackEvent(wasMerged ? 'invoice_merged_into_albaran' : 'invoice_saved', rid, { confidence: confidenceRaw, line_count: lineInputs.length }, invoiceId);

		void maybeSendQuotaWarning(rid);

		// The corrections log compares against the OCR read of *this* document; on a
		// merge, this document's data was folded into the pre-existing albaran, so
		// there is nothing meaningful to diff it against here.
		if (!wasMerged) {
			await logExtractionCorrections(
				invoiceId!,
				supplierId,
				rid,
				userId,
				extractedData,
				{ supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount },
				{ lineDescriptions, lineQuantities, lineUnits, lineUnitPrices, lineTotalPrices },
			);
		}

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
