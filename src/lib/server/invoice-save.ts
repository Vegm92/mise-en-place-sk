/**
 * Invoice save flow — shared by the extract review route and the batch page.
 * Pure outcome-returning function: no redirects or HTTP concerns in here;
 * callers translate the outcome into fail()/redirect().
 */
import { computeInvoiceContentHash } from './dedup';
import { db, forTenant } from './db';
import { suppliers, invoices, invoiceLineItems, extractionCorrections, settings } from './schema';
import { eq, and, isNull } from 'drizzle-orm';
import { resolveUnit } from './unit-bridge';
import { runPriceShock, runStockForecast, runBudgetCheck } from './alert-engine';
import { saveAlerts } from './notifications';
import { maybeSendQuotaWarning } from './quota-warning';
import { trackEvent } from './events';
import { claimRequest, releaseRequest, isValidKey } from './idempotency';
import type { EnrichedLineItem } from './unit-bridge';
import type { BatchDb, BatchItem } from './batch-core';

export type SaveOutcome =
	| { type: 'lowConfidenceBlocked' }
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
	totalAmount: number | null;
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

/**
 * Validates and persists a reviewed invoice from the submitted form data.
 * Does NOT transition the batch item on duplicates — callers decide what a
 * duplicate means for the batch (discard + where to go next). On a successful
 * save, `onSaved` runs inside the same transaction, so callers can commit the
 * batch-item confirm atomically with the invoice insert (issue #248) — a
 * crash between the two can no longer strand the item as reviewable.
 */
export async function saveReviewedInvoice(
	item: BatchItem | null,
	formData: FormData,
	rid: string,
	onSaved?: (tx: BatchDb) => Promise<void>,
): Promise<SaveOutcome> {
	// Idempotency key (issue #250) — claimed inside the save transaction below.
	const idemKeyRaw = formData.get('idempotency_key');
	const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;
	const tdb = forTenant(rid);
	const supplierName = (formData.get('supplier_name') as string) ?? '';
	const invoiceNumber = (formData.get('invoice_number') as string) ?? '';
	const invoiceDate = (formData.get('invoice_date') as string) || null;
	const dueDate = (formData.get('due_date') as string) || null;
	const totalAmount = toFloat(formData.get('total_amount'));
	const confidenceRaw = toFloat(formData.get('confidence'));
	const notesRaw = (formData.get('notes') as string) ?? '';
	const notes = notesRaw.slice(0, 250) || null;

	// Gate: block save if any header field is low-confidence and user hasn't acknowledged
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

	const lineDescriptions = formData.getAll('line_descriptions') as string[];
	const lineQuantities = formData.getAll('line_quantities') as string[];
	const lineUnits = formData.getAll('line_units') as string[];
	const lineUnitPrices = formData.getAll('line_unit_prices') as string[];
	const lineTotalPrices = formData.getAll('line_total_prices') as string[];
	const lineTaxRates = formData.getAll('line_tax_rates') as string[];

	// Block 100%-exact content duplicates: compute a canonical hash of all
	// user-confirmed fields and reject if a non-deleted invoice in this
	// tenant already has the same hash.
	const nonEmptyDescs = lineDescriptions.filter(d => d.trim());
	const contentHash = computeInvoiceContentHash({
		supplierName,
		invoiceNumber,
		invoiceDate,
		dueDate,
		totalAmount,
		lineDescriptions: nonEmptyDescs,
		lineQuantities:   nonEmptyDescs.map((_, i) => toFloat(lineQuantities[i])),
		lineUnits:        nonEmptyDescs.map((_, i) => lineUnits[i]?.trim() || null),
		lineUnitPrices:   nonEmptyDescs.map((_, i) => toFloat(lineUnitPrices[i])),
		lineTotalPrices:  nonEmptyDescs.map((_, i) => toFloat(lineTotalPrices[i])),
	});

	const hashMatch = await db
		.select({ id: invoices.id })
		.from(invoices)
		.where(and(tdb.scope(invoices.restaurantId), eq(invoices.contentHash, contentHash), isNull(invoices.deletedAt)))
		.limit(1);

	if (hashMatch.length > 0) {
		return { type: 'contentDuplicate', duplicateId: hashMatch[0].id };
	}

	const extractedData = item?.extractedData ?? undefined;
	const taxBase = toFloat(extractedData?.tax_base);
	const taxBreakdownRaw = extractedData?.tax_breakdown;
	const taxBreakdown = Array.isArray(taxBreakdownRaw) ? JSON.stringify(taxBreakdownRaw) : null;
	const primaryFile = item?.fileKey ?? null;

	// Pre-compute unit resolutions outside the transaction (read-only DB calls)
	type LineInput = {
		desc: string;
		qtyFloat: number | null;
		unitPriceFloat: number | null;
		unitVal: string | null;
		totalPriceVal: number | null;
		taxRateVal: number | null;
	};
	const lineInputs: LineInput[] = [];
	for (let i = 0; i < lineDescriptions.length; i++) {
		const desc = lineDescriptions[i].trim();
		if (!desc) continue;
		lineInputs.push({
			desc,
			qtyFloat: toFloat(lineQuantities[i]),
			unitPriceFloat: toFloat(lineUnitPrices[i]),
			unitVal: lineUnits[i]?.trim() || null,
			totalPriceVal: toFloat(lineTotalPrices[i]),
			taxRateVal: toFloat(lineTaxRates[i]),
		});
	}
	const unitRules = await Promise.all(
		lineInputs.map(li =>
			li.unitVal ? resolveUnit(supplierName, li.desc, li.unitVal, rid) : Promise.resolve(null)
		)
	);

	// Transactional save: supplier upsert + invoice insert + line items
	let supplierId = 0;
	let invoiceId: number | null = null;
	let isDuplicate = false;
	let isReplay = false;
	const savedItems: EnrichedLineItem[] = [];
	const unitConversionAlerts: Array<{ notificationType: string; message: string; payload: Record<string, unknown> }> = [];

	await db.transaction(async (tx) => {
		// Idempotency claim first — a replayed submit (double-click, offline
		// replay) finds the key present and skips the whole save (issue #250).
		if (idemKey && !(await claimRequest(idemKey, rid, tx))) {
			isReplay = true;
			return;
		}

		// Upsert supplier
		const existingSupplier = await tx
			.select({ id: suppliers.id })
			.from(suppliers)
			.where(tdb.scope(suppliers.restaurantId, eq(suppliers.name, supplierName)))
			.limit(1);

		if (existingSupplier.length > 0) {
			supplierId = existingSupplier[0].id;
		} else {
			const ins = await tx.insert(suppliers).values({ name: supplierName, restaurantId: rid }).returning({ id: suppliers.id });
			supplierId = ins[0].id;
		}

		// Duplicate check; onConflictDoNothing below handles the race condition
		if (invoiceNumber.trim()) {
			const dup = await tx
				.select({ id: invoices.id })
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.supplierId, supplierId), eq(invoices.invoiceNumber, invoiceNumber.trim())))
				.limit(1);
			if (dup.length > 0) {
				isDuplicate = true;
				// Release the key so a corrected resubmit (fixed number) isn't
				// skipped as a replay (issue #250).
				if (idemKey) await releaseRequest(idemKey, tx);
				return;
			}
		}

		// Insert invoice — onConflictDoNothing guards against concurrent duplicate inserts
		const insertedInvoice = await tx
			.insert(invoices)
			.values({
				restaurantId: rid,
				supplierId,
				invoiceNumber: invoiceNumber || null,
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
			})
			.onConflictDoNothing()
			.returning({ id: invoices.id });

		if (!insertedInvoice.length) {
			isDuplicate = true;
			if (idemKey) await releaseRequest(idemKey, tx);
			return;
		}
		invoiceId = insertedInvoice[0].id;

		// Insert line items (unit rules pre-computed above)
		for (let i = 0; i < lineInputs.length; i++) {
			const li = lineInputs[i];
			const rule = unitRules[i];
			const canonicalUnit = rule?.canonicalUnit ?? null;
			const requiresConv = !rule && !!li.unitVal ? 1 : 0;
			const factor = rule?.conversionFactor ?? 0;
			const convertedQty = rule && factor > 0 && li.qtyFloat != null ? Math.round(li.qtyFloat * factor * 10000) / 10000 : null;
			const convertedPrice = rule && factor > 0 && li.unitPriceFloat != null ? Math.round((li.unitPriceFloat / factor) * 10000) / 10000 : null;

			await tx.insert(invoiceLineItems).values({
				invoiceId: invoiceId!,
				restaurantId: rid,
				description: li.desc,
				quantity: li.qtyFloat,
				unit: li.unitVal,
				unitPrice: li.unitPriceFloat,
				totalPrice: li.totalPriceVal,
				taxRate: li.taxRateVal,
				requiresUnitConversion: requiresConv,
				canonicalUnit,
			});

			savedItems.push({
				description: li.desc,
				quantity: li.qtyFloat,
				unit: li.unitVal,
				unitPrice: li.unitPriceFloat,
				totalPrice: li.totalPriceVal,
				canonicalUnit,
				requiresUnitConversion: !!requiresConv,
				convertedQuantity: convertedQty,
				convertedUnitPrice: convertedPrice,
			});

			if (requiresConv) {
				unitConversionAlerts.push({
					notificationType: 'unit_conversion_needed',
					message: `Has comprado ${li.qtyFloat ?? '?'} ${li.unitVal} de '${li.desc}'. ¿Cuántos unidades base contiene este ${li.unitVal} para actualizar tu stock correctamente?`,
					payload: { supplierName, ingredient: li.desc, purchaseUnit: li.unitVal, quantity: li.qtyFloat },
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

	// Post-commit side effects are explicitly non-critical — the invoice is
	// already persisted, so a failure here must not 500 the action and make a
	// saved invoice look unsaved (issue #248).
	let isFirstInvoice = false;
	try {
		const priceAlerts = await runPriceShock(invoiceId!, supplierName, savedItems, rid);
		const stockAlerts = await runStockForecast(savedItems, rid);
		const budgetAlerts = await runBudgetCheck(invoiceId!, supplierId, rid);
		await saveAlerts(invoiceId!, rid, [...unitConversionAlerts, ...priceAlerts, ...stockAlerts, ...budgetAlerts]);

		trackEvent('invoice_saved', rid, { confidence: confidenceRaw, line_count: lineInputs.length }, invoiceId);

		// Fire-and-forget: warn the owner when monthly usage nears the plan quota.
		void maybeSendQuotaWarning(rid);

		// Log field corrections (original AI values vs user-submitted values)
		await logExtractionCorrections(
			invoiceId!,
			supplierId,
			rid,
			extractedData,
			{ supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount },
			{ lineDescriptions, lineQuantities, lineUnits, lineUnitPrices, lineTotalPrices },
		);

		// Mark onboarding complete on first invoice save
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
