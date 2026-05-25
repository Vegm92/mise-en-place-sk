import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import { MAX_CONCURRENT_EXTRACTIONS } from '$lib/server/env';
import { extractInvoice } from '$lib/server/extract';
import { readSession, writeSession, deleteSession, uploadsDir } from '$lib/server/sessions';
import { tryAcquireExtraction, releaseExtraction } from '$lib/server/rate-limiter';
import { db } from '$lib/server/db';
import { suppliers, invoices, invoiceLineItems } from '$lib/server/schema';
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

export const load: PageServerLoad = async ({ params }) => {
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
			extractError = 'The system is currently processing too many invoices. Please try again in a moment.';
		} else {
			try {
				const firstFile = path.join(dir, existingPaths[0]);
				const result = await extractInvoice(firstFile);
				extractedData = result as unknown as Record<string, unknown>;
				writeSession({ ...session, extractedData });
			} catch (err) {
				const status = (err as { status?: number }).status;
				extractError =
					status === 429
						? 'The AI service is currently busy — please try again in a moment.'
						: status === 503
							? 'The AI service is temporarily unavailable — please try again shortly.'
							: 'Extraction failed — please try again, or contact support if the issue persists.';
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

	const { enriched, conversionNotes } = annotateLineItems(supplierName, lineItems);

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

export const actions: Actions = {
	save: async ({ params, request }) => {
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

		const extractedData = session?.extractedData as Record<string, unknown> | undefined;
		const taxBase = toFloat(extractedData?.tax_base);
		const taxBreakdownRaw = extractedData?.tax_breakdown;
		const taxBreakdown = Array.isArray(taxBreakdownRaw) ? JSON.stringify(taxBreakdownRaw) : null;

		// Upsert supplier
		let supplierId: number;
		const existingSupplier = await db
			.select()
			.from(suppliers)
			.where(eq(suppliers.name, supplierName))
			.limit(1);

		if (existingSupplier.length > 0) {
			supplierId = existingSupplier[0].id;
		} else {
			const inserted = await db.insert(suppliers).values({ name: supplierName }).returning({ id: suppliers.id });
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

			const rule = unitVal ? resolveUnit(supplierName, desc, unitVal) : null;
			const canonicalUnit = rule?.canonicalUnit ?? null;
			const requiresConv = !rule && !!unitVal ? 1 : 0;
			const factor = rule?.conversionFactor ?? 0;
			const convertedQty = rule && factor > 0 && qtyFloat != null ? Math.round(qtyFloat * factor * 10000) / 10000 : null;
			const convertedPrice = rule && factor > 0 && unitPriceFloat != null ? Math.round((unitPriceFloat / factor) * 10000) / 10000 : null;

			await db.insert(invoiceLineItems).values({
				invoiceId,
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
		const priceAlerts = runPriceShock(invoiceId, supplierName, savedItems);
		const stockAlerts = runStockForecast(savedItems);
		const budgetAlerts = runBudgetCheck(invoiceId, supplierId);
		saveAlerts(invoiceId, [...unitConversionAlerts, ...priceAlerts, ...stockAlerts, ...budgetAlerts]);

		// Keep files on disk — sourceFile in DB points to them for "See original".
		// Files are only deleted on discard.
		const remaining = session?.remaining ?? [];
		deleteSession(params.id);

		if (remaining.length > 0) redirect(303, `/extract/${remaining[0]}`);
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
