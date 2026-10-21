import { TransactionRollbackError } from 'drizzle-orm';
import { db, forTenant } from './db';
import { claimRequest, releaseRequest, isValidKey } from './idempotency';
import { findSupplierId } from './supplier';
import { findContentHashDuplicate, findInvoiceDuplicate, type DuplicateOutcome } from './invoice-dedup';
import { parseInvoiceForm, resolveFormReviewState, type FormRejection } from './invoice-form';
import {
	enrichLineItems, resolveSupplierInfo, persistSupplierAndProfile, insertInvoiceWithLines, type ProfileMismatch,
} from './invoice-persist';
import { runPostSaveEffects } from './invoice-effects';
import { trackEvent } from './events';
import type { BatchDb, BatchItem } from './batch';
import type { EnrichedLineItem } from './products';
import type { Alert } from './alerts';

export { findExistingFilenames } from './invoice-persist';

export type SaveOutcome =
	| FormRejection
	| DuplicateOutcome
	| { type: 'replay' }
	| { type: 'saved'; invoiceId: number; isFirstInvoice: boolean };

export async function saveReviewedInvoice(
	item: BatchItem | null,
	formData: FormData,
	rid: string,
	userId: string,
	onSaved?: (tx: BatchDb, invoiceId: number) => Promise<void>,
	requestId?: string,
): Promise<SaveOutcome> {
	const parsed = parseInvoiceForm(item, formData);
	if (!parsed.ok) return parsed.rejection;
	const { form } = parsed;
	const { supplierName, contentHash } = form;

	const idemKeyRaw = formData.get('idempotency_key');
	const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;
	const tdb = forTenant(rid);

	const supplierResolution = await resolveSupplierInfo(rid, form.extracted, supplierName);
	const { proposedCategory, proposedContact, contactTrusted } = supplierResolution;
	const enrichedLines = await enrichLineItems(rid, supplierName, form.lineInputs);
	const review = resolveFormReviewState(form, enrichedLines.some((l) => l.requiresUnitConversion));

	let supplierId = 0;
	let invoiceId: number | null = null;
	let duplicateOutcome: DuplicateOutcome | null = null;
	let isReplay = false;
	let restaurantPhoneMismatch: ProfileMismatch | null = null;
	let restaurantTaxIdMismatch: ProfileMismatch | null = null;
	let savedItems: EnrichedLineItem[] = [];
	let unitConversionAlerts: Alert[] = [];

	try {
		await db.transaction(async (tx) => {
			if (idemKey && !(await claimRequest(idemKey, rid, tx))) {
				isReplay = true;
				return;
			}

			const knownSupplierId = await findSupplierId(rid, supplierName, tx, proposedContact, contactTrusted);
			const preInsertDuplicate = await findInvoiceDuplicate(tx, tdb, {
				contentHash,
				supplierId: knownSupplierId,
				invoiceNumber: form.invoiceNumber.trim(),
			});
			if (preInsertDuplicate) {
				duplicateOutcome = preInsertDuplicate;
				if (idemKey) await releaseRequest(idemKey, tx);
				return;
			}

			({ supplierId, restaurantPhoneMismatch, restaurantTaxIdMismatch } = await persistSupplierAndProfile(
				tx, rid, supplierName, supplierResolution, form.extracted,
			));

			const inserted = await insertInvoiceWithLines(tx, {
				rid, userId, supplierId, supplierName, form, review, enrichedLines, sourceFile: item?.fileKey ?? null,
			});
			if (!inserted) {
				const raceHashDuplicateId = await findContentHashDuplicate(tx, tdb, contentHash);
				duplicateOutcome = raceHashDuplicateId !== null
					? { type: 'contentDuplicate', duplicateId: raceHashDuplicateId }
					: { type: 'numberDuplicate' };
				tx.rollback();
				return;
			}
			({ invoiceId, savedItems, unitConversionAlerts } = inserted);

			if (onSaved) await onSaved(tx, inserted.invoiceId);
		});
	} catch (err) {
		if (!(err instanceof TransactionRollbackError)) throw err;
	}

	if (isReplay) return { type: 'replay' };

	if (duplicateOutcome) {
		await trackEvent('duplicate_detected', rid, { supplier: supplierName, amount: form.totalAmount });
		return duplicateOutcome;
	}

	const isFirstInvoice = await runPostSaveEffects({
		invoiceId: invoiceId!, supplierId, rid, supplierName,
		invoiceNumber: form.invoiceNumber, invoiceDate: form.invoiceDate, dueDate: form.dueDate,
		totalAmount: form.totalAmount, documentType: form.documentType, purchaseOrder: form.purchaseOrder,
		confidenceRaw: form.confidenceRaw, lineInputs: form.lineInputs, savedItems, unitConversionAlerts,
		qrMismatches: form.qrMismatches, extractedData: form.extractedData,
		lineDescriptions: form.lineDescriptions, lineQuantities: form.lineQuantities, lineUnits: form.lineUnits,
		lineUnitPrices: form.lineUnitPrices, lineTotalPrices: form.lineTotalPrices,
		proposedCategory, reviewState: review.reviewState, tdb, restaurantPhoneMismatch, restaurantTaxIdMismatch,
		...(requestId !== undefined ? { requestId } : {}),
	});

	return { type: 'saved', invoiceId: invoiceId!, isFirstInvoice };
}
