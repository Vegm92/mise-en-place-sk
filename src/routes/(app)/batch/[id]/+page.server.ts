import { fail, redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import { localFilePath, saveUploadedFiles, deleteUploadFile } from '$lib/server/sessions';
import {
	getItem, getBatchItems, addItems, removeItem, deleteBatch, isBatchSettled,
	markQueued, markDiscarded, pickActiveItem,
} from '$lib/server/batch';
import { enqueueExtraction } from '$lib/server/queue';
import { enqueueBatchExtraction } from '$lib/server/extract-batch';
import { createBatchStore } from '$lib/server/batch-core';
import { saveReviewedInvoice } from '$lib/server/invoice-save';
import { trackEvent } from '$lib/server/events';
import { getStorage } from '$lib/server/storage';
import { STORAGE_DRIVER } from '$lib/server/env';
import { db, forTenant } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';

function humanSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileType(ext: string): string {
	const e = ext.toLowerCase().replace('.', '');
	return (e === 'jpeg' ? 'jpg' : e).toUpperCase();
}

function statSize(fileKey: string): string {
	if (STORAGE_DRIVER !== 'local') return '—';
	try {
		const fp = localFilePath(fileKey);
		if (fs.existsSync(fp)) return humanSize(fs.statSync(fp).size);
	} catch {
		// ignore stat errors — size stays '—'
	}
	return '—';
}

function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
	if (confidence >= 0.85) return 'high';
	if (confidence >= 0.6) return 'medium';
	return 'low';
}

/**
 * Read-only heads-up for the review screen — same supplier (case-insensitive,
 * matching the `uq_suppliers_rid_name` index) + same invoice number as an
 * already-saved invoice. This is a coarser check than the exact-content-hash
 * gate in invoice-save.ts (which fires on submit); it exists purely to flag
 * the likely duplicate before the user spends time reviewing fields, so they
 * can discard right away instead of hitting the block on confirm.
 */
async function findDuplicateInvoiceId(rid: string, supplierName: string, invoiceNumber: string): Promise<number | null> {
	const supplier = supplierName.trim();
	const number = invoiceNumber.trim();
	if (!supplier || !number) return null;

	const tdb = forTenant(rid);
	const rows = await db
		.select({ id: invoices.id })
		.from(invoices)
		.innerJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNull(invoices.deletedAt),
			eq(invoices.invoiceNumber, number),
			sql`lower(${suppliers.name}) = lower(${supplier})`,
		))
		.limit(1);

	return rows[0]?.id ?? null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	return handleLoad('batch', async () => {
		const items = await getBatchItems(params.id);
		if (!items.length) redirect(303, '/?error=Session+not+found');

		const open = items.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
		if (!open.length) redirect(303, '/');

		const queue = items
			.filter(i => i.status !== 'discarded')
			.map(i => ({
				id: i.id,
				name: i.displayName,
				size: statSize(i.fileKey),
				type: fileType(path.extname(i.displayName)),
				status: i.status,
				error: i.extractError ?? null,
			}));

		const active = pickActiveItem(items);
		const anyInFlight = open.some(i => i.status === 'queued' || i.status === 'extracting');
		const allPending = open.every(i => i.status === 'pending');

		let review = null;
		if (active && active.status === 'done') {
			const extractedData = active.extractedData ?? {};
			const confidence = typeof extractedData.confidence === 'number' ? extractedData.confidence : 0;
			const duplicateOfId = await findDuplicateInvoiceId(
				locals.restaurantId!,
				String(extractedData.supplier_name ?? ''),
				String(extractedData.invoice_number ?? ''),
			);
			review = {
				itemId: active.id,
				filename: active.displayName,
				data: extractedData,
				confidenceLevel: confidenceLevel(confidence),
				fieldConfidences: (extractedData.field_confidences as Record<string, number> | undefined) ?? {},
				conversionNotes: active.conversionNotes ?? [],
				duplicateOfId,
			};
		}

		return {
			title: 'inv.title',
			batchId: params.id,
			queue,
			review,
			failedItem: active && active.status === 'failed'
				? { itemId: active.id, name: active.displayName, error: active.extractError ?? 'extract.err.generic' }
				: null,
			anyInFlight,
			allPending,
			openCount: open.length,
			reviewedCount: items.filter(i => i.status === 'confirmed').length,
		};
	});
};

async function settledRedirect(batchId: string): Promise<never> {
	// Everything reviewed — leave the page. Confirmed invoices exist, so the
	// dashboard is the natural landing spot; an all-discarded batch goes home.
	const items = await getBatchItems(batchId);
	const confirmed = items.some(i => i.status === 'confirmed');
	redirect(303, confirmed ? '/dashboard' : '/');
}

export const actions: Actions = {
	extract: async ({ params, locals }) => {
		const items = await getBatchItems(params.id);
		if (!items.length) redirect(303, '/?error=Session+not+found');
		const rid = locals.restaurantId!;

		await enqueueBatchExtraction(items[0].id, rid, {
			getItem,
			getBatchItems,
			markQueued,
			enqueue: enqueueExtraction,
		});
		redirect(303, `/batch/${params.id}`);
	},

	retry: async ({ params, request, locals }) => {
		const formData = await request.formData();
		const itemId = (formData.get('itemId') as string) ?? '';
		const item = await getItem(itemId);
		if (item && item.batchId === params.id && item.restaurantId === locals.restaurantId) {
			if (await markQueued(item.id)) await enqueueExtraction(item.id, item.restaurantId);
		}
		redirect(303, `/batch/${params.id}`);
	},

	save: async ({ params, request, locals }) => {
		const formData = await request.formData();
		const itemId = (formData.get('itemId') as string) ?? '';
		const rid = locals.restaurantId!;

		const item = await getItem(itemId);
		if (!item || item.batchId !== params.id || item.restaurantId !== rid) {
			redirect(303, `/batch/${params.id}`);
		}

		// The done→confirmed transition commits atomically with the invoice
		// insert — a drop between them can no longer strand the item as
		// reviewable and produce a confusing duplicate error (issue #248).
		const outcome = await saveReviewedInvoice(item, formData, rid, async (tx) => {
			await createBatchStore(tx).markConfirmed(item.id);
		});

		// A replayed submit (double-click, offline replay) already saved on the
		// first pass — land on the batch page, which routes onward if settled.
		if (outcome.type === 'replay') redirect(303, `/batch/${params.id}`);

		if (outcome.type === 'lowConfidenceBlocked') return fail(422, { lowConfidenceBlocked: true });
		if (outcome.type === 'contentDuplicate') return fail(422, { contentDuplicate: true, duplicateId: outcome.duplicateId });

		if (outcome.type === 'numberDuplicate') {
			await markDiscarded(item.id);
			if (await isBatchSettled(params.id)) redirect(303, '/?duplicate_inv=1');
			redirect(303, `/batch/${params.id}`);
		}

		if (!(await isBatchSettled(params.id))) redirect(303, `/batch/${params.id}`);

		if (outcome.isFirstInvoice) redirect(303, '/dashboard?first_invoice=1');
		// Straight to the list that just changed, with a toast carrying the save
		// confirmation and any alerts (issue #235) — the interstitial page this
		// replaces existed only to say "saved ✓".
		redirect(303, `/invoices?saved=${outcome.invoiceId}`);
	},

	discardItem: async ({ params, request, locals }) => {
		const formData = await request.formData();
		const itemId = (formData.get('itemId') as string) ?? '';
		const item = await getItem(itemId);
		if (item && item.batchId === params.id && item.restaurantId === locals.restaurantId) {
			trackEvent('extraction_discarded', item.restaurantId, { files: [item.displayName] });
			await getStorage().delete(item.fileKey);
			await markDiscarded(item.id);
			if (await isBatchSettled(params.id)) await settledRedirect(params.id);
		}
		redirect(303, `/batch/${params.id}`);
	},

	discardBatch: async ({ params, locals }) => {
		const items = await getBatchItems(params.id);
		if (items.length && items[0].restaurantId === locals.restaurantId) {
			const rid = locals.restaurantId!;
			trackEvent('extraction_discarded', rid, { files: items.map(i => i.displayName) });
			for (const i of items) {
				if (i.status !== 'confirmed') await deleteUploadFile(i.fileKey);
			}
			await deleteBatch(params.id);
		}
		redirect(303, '/');
	},

	add: async ({ params, request, locals }) => {
		const items = await getBatchItems(params.id);
		if (!items.length || items[0].restaurantId !== locals.restaurantId) {
			redirect(303, '/?error=Session+not+found');
		}

		const formData = await request.formData();
		const rawFiles = formData.getAll('files');
		const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).size > 0);
		if (files.length === 0) return fail(400, { error: 'No valid files received.' });

		const { saved, keys } = await saveUploadedFiles(files, params.id);
		if (saved.length > 0) {
			const added = await addItems(params.id, items[0].restaurantId, saved.map((name, i) => ({ key: keys[i], name })));
			// If extraction is already running, fold the new items straight into the queue.
			const anyActive = items.some(i => i.status === 'queued' || i.status === 'extracting' || i.status === 'done');
			if (anyActive) {
				for (const id of added) {
					if (await markQueued(id)) await enqueueExtraction(id, items[0].restaurantId);
				}
			}
		}
		redirect(303, `/batch/${params.id}`);
	},

	remove: async ({ params, request, locals }) => {
		const formData = await request.formData();
		const itemId = (formData.get('itemId') as string) ?? '';
		const item = await getItem(itemId);
		if (item && item.batchId === params.id && item.restaurantId === locals.restaurantId) {
			const removed = await removeItem(item.id);
			if (removed) await deleteUploadFile(removed.fileKey);
		}
		const left = (await getBatchItems(params.id))
			.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
		if (!left.length) {
			await deleteBatch(params.id);
			redirect(303, '/');
		}
		redirect(303, `/batch/${params.id}`);
	},
};
