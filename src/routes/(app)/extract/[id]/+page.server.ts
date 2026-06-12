import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getItem, getBatchItems, nextReviewableItem, markConfirmed, markDiscarded, type BatchItem } from '$lib/server/batch';
import { trackEvent } from '$lib/server/events';
import { getStorage } from '$lib/server/storage';
import { saveReviewedInvoice } from '$lib/server/invoice-save';

function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
	if (confidence >= 0.85) return 'high';
	if (confidence >= 0.6) return 'medium';
	return 'low';
}

/** 1-based index of this item among the batch's open items, and the open count. */
async function batchPosition(item: BatchItem): Promise<{ invoiceIndex: number; totalInvoices: number }> {
	const open = (await getBatchItems(item.batchId))
		.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
	const idx = open.findIndex(i => i.id === item.id);
	return { invoiceIndex: idx === -1 ? 1 : idx + 1, totalInvoices: Math.max(open.length, 1) };
}

export const load: PageServerLoad = async ({ params }) => {
	const item = await getItem(params.id);
	if (!item) redirect(303, '/');

	// Already settled (e.g. revisited via back button) — continue with the batch.
	if (item.status === 'confirmed' || item.status === 'discarded') {
		const next = await nextReviewableItem(item.batchId, item.position);
		if (next) redirect(303, `/extract/${next.id}`);
		redirect(303, '/');
	}

	const { invoiceIndex, totalInvoices } = await batchPosition(item);
	// `pending` renders as queued: the extract action queues the whole batch,
	// so a pending item here only means the queue write hasn't landed yet.
	const status = item.status === 'pending' ? 'queued' : item.status;

	if (status === 'queued' || status === 'extracting') {
		return {
			title: 'Extrayendo factura…',
			id: params.id,
			filenames: [item.displayName],
			extractionStatus: status,
			invoiceIndex,
			totalInvoices,
		};
	}

	if (status === 'failed') {
		return {
			title: 'Error de extracción',
			id: params.id,
			filenames: [item.displayName],
			extractionStatus: 'failed' as const,
			error: item.extractError ?? 'extract.err.generic',
			invoiceIndex,
			totalInvoices,
		};
	}

	// status === 'done'
	const extractedData = item.extractedData ?? {};
	const conversionNotes = item.conversionNotes ?? [];
	const confidence = typeof extractedData.confidence === 'number' ? extractedData.confidence : 0;
	const fieldConfidences = (extractedData.field_confidences as Record<string, number> | undefined) ?? {};

	return {
		title: 'Review Extraction',
		id: params.id,
		filenames: [item.displayName],
		extractionStatus: 'done' as const,
		data: extractedData,
		confidenceLevel: confidenceLevel(confidence),
		fieldConfidences,
		error: null,
		invoiceIndex,
		totalInvoices,
		conversionNotes,
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		const item = await getItem(params.id);
		const formData = await request.formData();
		const rid = locals.restaurantId!;

		const outcome = await saveReviewedInvoice(item, formData, rid);

		if (outcome.type === 'lowConfidenceBlocked') return fail(422, { lowConfidenceBlocked: true });
		if (outcome.type === 'contentDuplicate') return fail(422, { contentDuplicate: true, duplicateId: outcome.duplicateId });

		if (outcome.type === 'numberDuplicate') {
			if (item) {
				await markDiscarded(item.id);
				const next = await nextReviewableItem(item.batchId, item.position);
				if (next) redirect(303, `/extract/${next.id}`);
			}
			redirect(303, '/?duplicate_inv=1');
		}

		if (item) {
			await markConfirmed(item.id);
			const next = await nextReviewableItem(item.batchId, item.position);
			if (next) redirect(303, `/extract/${next.id}`);
		}

		if (outcome.isFirstInvoice) redirect(303, '/dashboard?first_invoice=1');
		redirect(303, `/save-confirmation/${outcome.invoiceId}`);
	},

	discard: async ({ params, locals }) => {
		const item = await getItem(params.id);
		if (item) {
			const rid = locals.restaurantId;
			if (rid) trackEvent('extraction_discarded', rid, { files: [item.displayName] });
			await getStorage().delete(item.fileKey);
			await markDiscarded(item.id);
			const next = await nextReviewableItem(item.batchId, item.position);
			if (next) redirect(303, `/extract/${next.id}`);
		}
		redirect(303, '/');
	},
};
