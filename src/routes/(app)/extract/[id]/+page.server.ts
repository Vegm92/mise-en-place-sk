import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import { MAX_CONCURRENT_EXTRACTIONS } from '$lib/server/env';
import { extractInvoice } from '$lib/server/extract';
import { readSession, writeSession, deleteSession, uploadsDir } from '$lib/server/sessions';
import { tryAcquireExtraction, releaseExtraction } from '$lib/server/rate-limiter';
import { db } from '$lib/server/db';
import { suppliers, invoices, invoiceLineItems, extractionCorrections, settings } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import { annotateLineItems, resolveUnit } from '$lib/server/unit-bridge';
import { runPriceShock, runStockForecast, runBudgetCheck } from '$lib/server/alert-engine';
import { saveAlerts } from '$lib/server/notifications';
import type { EnrichedLineItem } from '$lib/server/unit-bridge';

function toFloat(value: unknown): number | null {
	if (!value) return null;
	const n = parseFloat(String(value));
	return isNaN(n) ? null : n;
}

function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
	if (confidence >= 0.85) return 'high';
	if (confidence >= 0.6) return 'medium';
	return 'low';
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const session = readSession(params.id);
	if (!session || !session.files.length) {
		redirect(303, '/');
	}

	const dir = uploadsDir();
	const existingPaths = session.files.filter((f) => fs.existsSync(path.join(dir, f)));

	if (existingPaths.length === 0) {
		redirect(303, '/?error=Files+not+found');
	}

	let extractedData: Record<string, unknown> = {};
	let extractError: string | null = null;

	if (session.extractedData && Object.keys(session.extractedData).length > 0) {
		extractedData = session.extractedData;
	} else {
		const acquired = tryAcquireExtraction(MAX_CONCURRENT_EXTRACTIONS);
		if (!acquired) {
			extractError = 'extract.err.tooMany';
		} else {
			try {
				const firstFile = path.join(dir, existingPaths[0]);
				const result = await extractInvoice(firstFile);
				extractedData = result as unknown as Record<string, unknown>;
				writeSession({ ...session, extractedData });
			} catch (err) {
				const status = (err as { status?: number }).status;
				const message = (err as { message?: string }).message ?? '';
				extractError =
					status === 429
						? 'extract.err.rateLimited'
						: status === 503
							? 'extract.err.unavailable'
							: message.includes('invalid JSON')
								? 'extract.err.notInvoice'
								: 'extract.err.generic';
				console.error('[extract] Extraction failed for', existingPaths[0], err);
			} finally {
				releaseExtraction();
			}
		}
	}

	// Run unit bridge on extracted line items
	const supplierName = (extractedData.supplier_name as string) ?? '';
	const rawItems = (extractedData.line_items as unknown[]) ?? [];

	const lineItems = rawItems.map((i) => {
		const item = i as Record<string, unknown>;
		return {
			description: (item.description as string) ?? '',
			quantity: (item.quantity as number | null) ?? null,
			unit: (item.unit as string | null) ?? null,
			unitPrice: (item.unit_price as number | null) ?? null,
			totalPrice: (item.total_price as number | null) ?? null,
			itemConfidence: typeof item.confidence === 'number' ? item.confidence : undefined,
		};
	});

	const rid = locals.restaurantId ?? '';
	const { enriched, conversionNotes } = await annotateLineItems(supplierName, lineItems, rid);

	extractedData.line_items = enriched.map((item) => ({
		description: item.description,
		quantity: item.quantity,
		unit: item.unit,
		unit_price: item.unitPrice,
		total_price: item.totalPrice,
		canonical_unit: item.canonicalUnit,
		requires_unit_conversion: item.requiresUnitConversion,
		confidence: (item as Record<string, unknown>).itemConfidence,
	}));

	const confidence = typeof extractedData.confidence === 'number' ? extractedData.confidence : 0;
	const fieldConfidences = (extractedData.field_confidences as Record<string, number> | undefined) ?? {};

	return {
		title: 'Review Extraction',
		id: params.id,
		filenames: session.files,
		data: extractedData,
		confidenceLevel: confidenceLevel(confidence),
		fieldConfidences,
		error: extractError,
		invoiceIndex: session.invoiceIndex ?? 1,
		totalInvoices: session.totalInvoices ?? 1,
		conversionNotes,
	};
};

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
	}
}

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		const session = readSession(params.id);
		const formData = await request.formData();

		const supplierName = (formData.get('supplier_name') as string) ?? '';
		const invoiceNumber = (formData.get('invoice_number') as string) ?? '';
		const invoiceDate = (formData.get('invoice_date') as string) || null;
		const dueDate = (formData.get('due_date') as string) || null;
		const totalAmount = toFloat(formData.get('total_amount'));
		const confidenceRaw = toFloat(formData.get('confidence'));
		const notesRaw = (formData.get('notes') as string) ?? '';
		const notes = notesRaw.slice(0, 250) || null;

		const lineDescriptions = formData.getAll('line_descriptions') as string[];
		const lineQuantities = formData.getAll('line_quantities') as string[];
		const lineUnits = formData.getAll('line_units') as string[];
		const lineUnitPrices = formData.getAll('line_unit_prices') as string[];
		const lineTotalPrices = formData.getAll('line_total_prices') as string[];
		const lineTaxRates = formData.getAll('line_tax_rates') as string[];

		const rid = locals.restaurantId!;
		const extractedData = session?.extractedData as Record<string, unknown> | undefined;
		const taxBase = toFloat(extractedData?.tax_base);
		const taxBreakdownRaw = extractedData?.tax_breakdown;
		const taxBreakdown = Array.isArray(taxBreakdownRaw) ? JSON.stringify(taxBreakdownRaw) : null;

		// Upsert supplier
		let supplierId: number;
		const existingSupplier = await db
			.select()
			.from(suppliers)
			.where(and(eq(suppliers.name, supplierName), eq(suppliers.restaurantId, rid)))
			.limit(1);

		if (existingSupplier.length > 0) {
			supplierId = existingSupplier[0].id;
		} else {
			const inserted = await db.insert(suppliers).values({ name: supplierName, restaurantId: rid }).returning({ id: suppliers.id });
			supplierId = inserted[0].id;
		}

		// Check for duplicate invoice number
		if (invoiceNumber.trim()) {
			const duplicate = await db
				.select()
				.from(invoices)
				.where(and(eq(invoices.supplierId, supplierId), eq(invoices.invoiceNumber, invoiceNumber.trim())))
				.limit(1);

			if (duplicate.length > 0) {
				const remaining = session?.remaining ?? [];
				deleteSession(params.id);
				if (remaining.length > 0) redirect(303, `/extract/${remaining[0]}`);
				redirect(303, '/?duplicate_inv=1');
			}
		}

		const primaryFile = session?.files[0] ?? null;

		const insertedInvoice = await db
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
				notes,
			})
			.returning({ id: invoices.id });

		const invoiceId = insertedInvoice[0].id;

		// Insert line items with unit bridge resolution
		const savedItems: EnrichedLineItem[] = [];
		const unitConversionAlerts = [];

		for (let i = 0; i < lineDescriptions.length; i++) {
			const desc = lineDescriptions[i].trim();
			if (!desc) continue;

			const qtyFloat = toFloat(lineQuantities[i]);
			const unitPriceFloat = toFloat(lineUnitPrices[i]);
			const unitVal = lineUnits[i]?.trim() || null;

			const rule = unitVal ? await resolveUnit(supplierName, desc, unitVal, rid) : null;
			const canonicalUnit = rule?.canonicalUnit ?? null;
			const requiresConv = !rule && !!unitVal ? 1 : 0;
			const factor = rule?.conversionFactor ?? 0;
			const convertedQty = rule && factor > 0 && qtyFloat != null ? Math.round(qtyFloat * factor * 10000) / 10000 : null;
			const convertedPrice = rule && factor > 0 && unitPriceFloat != null ? Math.round((unitPriceFloat / factor) * 10000) / 10000 : null;

			await db.insert(invoiceLineItems).values({
				invoiceId,
				restaurantId: rid,
				description: desc,
				quantity: qtyFloat,
				unit: unitVal,
				unitPrice: unitPriceFloat,
				totalPrice: toFloat(lineTotalPrices[i]),
				taxRate: toFloat(lineTaxRates[i]),
				requiresUnitConversion: requiresConv,
				canonicalUnit,
			});

			const enrichedItem: EnrichedLineItem = {
				description: desc,
				quantity: qtyFloat,
				unit: unitVal,
				unitPrice: unitPriceFloat,
				totalPrice: toFloat(lineTotalPrices[i]),
				canonicalUnit,
				requiresUnitConversion: !!requiresConv,
				convertedQuantity: convertedQty,
				convertedUnitPrice: convertedPrice,
			};
			savedItems.push(enrichedItem);

			if (requiresConv) {
				unitConversionAlerts.push({
					notificationType: 'unit_conversion_needed',
					message: `Has comprado ${qtyFloat ?? '?'} ${unitVal} de '${desc}'. ¿Cuántos unidades base contiene este ${unitVal} para actualizar tu stock correctamente?`,
					payload: { supplierName, ingredient: desc, purchaseUnit: unitVal, quantity: qtyFloat },
				});
			}
		}

		// Fire BI alerts
		const priceAlerts = await runPriceShock(invoiceId, supplierName, savedItems, rid);
		const stockAlerts = await runStockForecast(savedItems, rid);
		const budgetAlerts = await runBudgetCheck(invoiceId, supplierId, rid);
		await saveAlerts(invoiceId, rid, [...unitConversionAlerts, ...priceAlerts, ...stockAlerts, ...budgetAlerts]);

		// Log field corrections (original AI values vs user-submitted values)
		await logExtractionCorrections(
			invoiceId,
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
			.where(and(eq(settings.restaurantId, rid), eq(settings.key, 'has_completed_onboarding')))
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

		const remaining = session?.remaining ?? [];
		deleteSession(params.id);

		if (remaining.length > 0) redirect(303, `/extract/${remaining[0]}`);
		if (isFirstInvoice) redirect(303, '/dashboard?first_invoice=1');
		redirect(303, `/save-confirmation/${invoiceId}`);
	},

	discard: async ({ params }) => {
		const session = readSession(params.id);
		if (session) {
			const dir = uploadsDir();
			for (const name of session.files) {
				const fp = path.resolve(dir, name);
				if (fp.startsWith(dir) && fs.existsSync(fp)) fs.unlinkSync(fp);
			}
			deleteSession(params.id);
		}
		redirect(303, '/');
	},
};
