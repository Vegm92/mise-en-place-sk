import { db, forTenant } from './db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, restaurants } from './schema';
import { eq, and, isNull } from 'drizzle-orm';
import { normalizePhoneNumber } from '$lib/phone';
import { normalizeTaxId, taxIdDecidesIdentity } from '$lib/tax-id';
import { resolveUnit, normalizedUnitPrice, type EnrichedLineItem } from './products';
import { isSameSupplierName } from './normalize';
import type { Alert } from './alerts';
import { getOrCreateSupplierId, type SupplierContactInfo } from './supplier';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { resolveCategoryFor } from './categories';
import type { ExtractedInvoice } from './contracts/extraction-contract.js';
import type { BatchDb } from './batch';
import { toMoneyString } from './money';
import { renderTemplate } from '$lib/i18n-messages';
import type { LineFormInput, ParsedInvoiceForm } from './invoice-form';
import type { IncidenceKind, IncidenceReason, ReviewState } from '$lib/status';

export const documentReferenceColumns = {
	purchase_order: invoices.purchaseOrder,
	seller_name: invoices.sellerName,
	delivery_date: invoices.deliveryDate,
	delivery_address: invoices.deliveryAddress,
	printed_notes: invoices.printedNotes,
};

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

export async function findExistingFilenames(restaurantId: string): Promise<Set<string>> {
	const tdb = forTenant(restaurantId);
	const rows = await db
		.select({ sourceFile: invoices.sourceFile })
		.from(invoices)
		.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)));
	return new Set(rows.map((r) => r.sourceFile?.toLowerCase()).filter((n): n is string => !!n));
}

export type EnrichedLine = {
	input: LineFormInput;
	columns: Omit<typeof invoiceLineItems.$inferInsert, 'invoiceId' | 'restaurantId'>;
	item: EnrichedLineItem;
	requiresUnitConversion: boolean;
};

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

export async function resolveSupplierInfo(rid: string, extracted: ExtractedInvoice | undefined, supplierName: string): Promise<{ proposedCategory: string; proposedContact: SupplierContactInfo; contactTrusted: boolean }> {
	const sameSupplier = typeof extracted?.supplier_name === 'string' && isSameSupplierName(extracted.supplier_name, supplierName);
	return {
		proposedCategory: sameSupplier
			? await resolveCategoryFor(rid, extracted?.supplier_category, extracted?.field_confidences?.supplier_category)
			: UNCATEGORIZED_CATEGORY,
		proposedContact: {
			cif: extracted?.supplier_nif ?? null,
			cifConfidence: extracted?.field_confidences?.supplier_nif ?? null,
			email: extracted?.supplier_email ?? null,
			phone: extracted?.supplier_phone ?? null,
			address: extracted?.supplier_address ?? null,
			iban: extracted?.iban ?? null,
			paymentTerms: extracted?.payment_terms ?? null,
		},
		contactTrusted: sameSupplier,
	};
}

export interface ProfileMismatch {
	current: string;
	extracted: string;
}

async function resolveRestaurantPhoneSignal(
	tx: BatchDb,
	rid: string,
	receiverPhone: string | null,
): Promise<ProfileMismatch | null> {
	if (!receiverPhone) return null;

	const [row] = await tx.select({ phone: restaurants.phone }).from(restaurants).where(eq(restaurants.id, rid)).limit(1);
	const current = row?.phone ?? null;

	if (!current) {
		await tx.update(restaurants).set({ phone: receiverPhone }).where(and(eq(restaurants.id, rid), isNull(restaurants.phone)));
		return null;
	}

	const currentNorm = normalizePhoneNumber(current);
	const extractedNorm = normalizePhoneNumber(receiverPhone);
	if (currentNorm.ok && extractedNorm.ok && currentNorm.phone !== extractedNorm.phone) {
		return { current, extracted: receiverPhone };
	}
	return null;
}

async function resolveRestaurantTaxIdSignal(
	tx: BatchDb,
	rid: string,
	receiverNif: string | null,
	receiverNifConfidence: number | null,
): Promise<ProfileMismatch | null> {
	const extractedNorm = normalizeTaxId(receiverNif);
	if (!extractedNorm || !taxIdDecidesIdentity(extractedNorm, receiverNifConfidence)) return null;

	const [row] = await tx.select({ cifNif: restaurants.cifNif }).from(restaurants).where(eq(restaurants.id, rid)).limit(1);
	const current = row?.cifNif ?? null;
	const currentNorm = normalizeTaxId(current);
	if (!current || !currentNorm || currentNorm === extractedNorm) return null;

	return { current, extracted: extractedNorm };
}

export type SupplierResolution = Awaited<ReturnType<typeof resolveSupplierInfo>>;

export async function persistSupplierAndProfile(
	tx: BatchDb,
	rid: string,
	supplierName: string,
	resolution: SupplierResolution,
	extracted: ExtractedInvoice | undefined,
): Promise<{
	supplierId: number;
	restaurantPhoneMismatch: ProfileMismatch | null;
	restaurantTaxIdMismatch: ProfileMismatch | null;
}> {
	const supplierId = await getOrCreateSupplierId(
		rid, supplierName, tx, resolution.proposedCategory, resolution.proposedContact, resolution.contactTrusted,
	);
	const restaurantPhoneMismatch = await resolveRestaurantPhoneSignal(tx, rid, extracted?.receiver_phone ?? null);
	const restaurantTaxIdMismatch = await resolveRestaurantTaxIdSignal(
		tx, rid, extracted?.receiver_nif ?? null, extracted?.field_confidences?.receiver_nif ?? null,
	);

	const outstandingBalance = typeof extracted?.outstanding_balance === 'number' ? String(extracted.outstanding_balance) : null;
	if (outstandingBalance !== null) {
		await tx.update(suppliers).set({ outstandingBalance }).where(eq(suppliers.id, supplierId));
	}
	return { supplierId, restaurantPhoneMismatch, restaurantTaxIdMismatch };
}

export async function insertInvoiceWithLines(
	tx: BatchDb,
	p: {
		rid: string;
		userId: string;
		supplierId: number;
		supplierName: string;
		form: ParsedInvoiceForm;
		review: { reviewState: ReviewState; incidenceKind: IncidenceKind | null; incidenceReasons: IncidenceReason[] | null };
		sourceFile: string | null;
		enrichedLines: EnrichedLine[];
	},
): Promise<{ invoiceId: number; savedItems: EnrichedLineItem[]; unitConversionAlerts: Alert[] } | null> {
	const { rid, supplierId, form, review, sourceFile } = p;
	const inserted = await tx
		.insert(invoices)
		.values({
			restaurantId: rid,
			supplierId,
			invoiceNumber: form.invoiceNumber || null,
			documentType: form.documentType,
			invoiceDate: form.invoiceDate,
			dueDate: form.dueDate,
			totalAmount: form.totalAmount,
			taxBase: form.taxBase,
			taxBreakdown: form.taxBreakdown,
			grossAmount: form.grossAmount,
			discountAmount: form.discountAmount,
			retentionRate: form.retentionRate,
			retentionAmount: form.retentionAmount,
			paymentMethod: form.paymentMethod,
			paymentTerms: form.paymentTerms,
			status: 'pending',
			reviewState: review.reviewState,
			incidenceKind: review.incidenceKind,
			incidenceReasons: review.incidenceReasons,
			sourceFile,
			confidence: form.confidenceRaw,
			contentHash: form.contentHash,
			notes: form.notes,
			qrUrl: form.qrUrl,
			qrMismatch: form.qrMismatches.length > 0,
			purchaseOrder: form.purchaseOrder,
			sellerName: form.sellerName,
			deliveryDate: form.deliveryDate,
			deliveryAddress: form.deliveryAddress,
			printedNotes: form.printedNotes,
		})
		.onConflictDoNothing()
		.returning({ id: invoices.id });
	if (!inserted.length) return null;
	const invoiceId = inserted[0]!.id;

	const savedItems: EnrichedLineItem[] = [];
	const unitConversionAlerts: Alert[] = [];
	await insertEnrichedLines(
		tx, { invoiceId, rid, supplierId, supplierName: p.supplierName }, p.enrichedLines, savedItems, unitConversionAlerts,
	);
	await tx.insert(invoiceAuditLog).values({
		restaurantId: rid, invoiceId, action: 'create', userId: p.userId, sourceFile,
	});
	return { invoiceId, savedItems, unitConversionAlerts };
}
