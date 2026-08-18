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
import { eq, and, isNull, isNotNull, gte, lte, sql } from 'drizzle-orm';
import { findSimilarInvoice, isoDateOffset, SIMILAR_INVOICE_DATE_WINDOW_DAYS } from '$lib/server/dedup';

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
	}
	return '—';
}

function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
	if (confidence >= 0.85) return 'high';
	if (confidence >= 0.6) return 'medium';
	return 'low';
}

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

async function findSimilarInvoiceId(
	rid: string,
	supplierName: string,
	invoiceDate: string | null,
	totalAmount: number | null,
): Promise<number | null> {
	const supplier = supplierName.trim();
	if (!supplier || !invoiceDate || totalAmount == null) return null;

	const tdb = forTenant(rid);
	const candidates = await db
		.select({ id: invoices.id, totalAmount: invoices.totalAmount })
		.from(invoices)
		.innerJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNull(invoices.deletedAt),
			sql`lower(${suppliers.name}) = lower(${supplier})`,
			isNotNull(invoices.totalAmount),
			gte(invoices.invoiceDate, isoDateOffset(invoiceDate, -SIMILAR_INVOICE_DATE_WINDOW_DAYS)),
			lte(invoices.invoiceDate, isoDateOffset(invoiceDate, SIMILAR_INVOICE_DATE_WINDOW_DAYS)),
		))
		.limit(10);

	return findSimilarInvoice(candidates, totalAmount)?.id ?? null;
}

async function requireOwnedBatch(batchId: string, locals: App.Locals) {
	const items = await getBatchItems(batchId);
	if (!items.length || items.some(i => i.restaurantId !== locals.restaurantId)) {
		redirect(303, '/?error=Session+not+found');
	}
	return items;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	return handleLoad('batch', async () => {
		const items = await requireOwnedBatch(params.id, locals);

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
			const supplierNameStr = String(extractedData.supplier_name ?? '');
			const duplicateOfId = await findDuplicateInvoiceId(
				locals.restaurantId!,
				supplierNameStr,
				String(extractedData.invoice_number ?? ''),
			);
			const similarInvoiceId = duplicateOfId ? null : await findSimilarInvoiceId(
				locals.restaurantId!,
				supplierNameStr,
				typeof extractedData.invoice_date === 'string' ? extractedData.invoice_date : null,
				typeof extractedData.total_amount === 'number' ? extractedData.total_amount : null,
			);
			review = {
				itemId: active.id,
				filename: active.displayName,
				data: extractedData,
				confidenceLevel: confidenceLevel(confidence),
				fieldConfidences: (extractedData.field_confidences as Record<string, number> | undefined) ?? {},
				conversionNotes: active.conversionNotes ?? [],
				duplicateOfId,
				similarInvoiceId,
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
	const items = await getBatchItems(batchId);
	const confirmed = items.some(i => i.status === 'confirmed');
	redirect(303, confirmed ? '/dashboard' : '/');
}

export const actions: Actions = {
	extract: async ({ params, locals }) => {
		const items = await requireOwnedBatch(params.id, locals);
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
		const items = await requireOwnedBatch(params.id, locals);
		const item = items.find(i => i.id === itemId);
		if (item) {
			if (await markQueued(item.id)) await enqueueExtraction(item.id, item.restaurantId);
		}
		redirect(303, `/batch/${params.id}`);
	},

	save: async ({ params, request, locals }) => {
		const formData = await request.formData();
		const itemId = (formData.get('itemId') as string) ?? '';
		const rid = locals.restaurantId!;

		const items = await requireOwnedBatch(params.id, locals);
		const item = items.find(i => i.id === itemId);
		if (!item) {
			redirect(303, `/batch/${params.id}`);
		}

		const outcome = await saveReviewedInvoice(item, formData, rid, async (tx) => {
			await createBatchStore(tx).markConfirmed(item.id);
		});

		if (outcome.type === 'replay') redirect(303, `/batch/${params.id}`);

		if (outcome.type === 'invalidDate') return fail(400, { errorKey: 'error.invalidDate', errorField: outcome.field });
		if (outcome.type === 'lowConfidenceBlocked') return fail(422, { lowConfidenceBlocked: true });
		if (outcome.type === 'contentDuplicate') return fail(422, { contentDuplicate: true, duplicateId: outcome.duplicateId });

		if (outcome.type === 'numberDuplicate') {
			await markDiscarded(item.id);
			if (await isBatchSettled(params.id)) redirect(303, '/?duplicate_inv=1');
			redirect(303, `/batch/${params.id}`);
		}

		if (!(await isBatchSettled(params.id))) redirect(303, `/batch/${params.id}`);

		if (outcome.isFirstInvoice) redirect(303, '/dashboard?first_invoice=1');
		redirect(303, `/invoices?saved=${outcome.invoiceId}`);
	},

	discardItem: async ({ params, request, locals }) => {
		const formData = await request.formData();
		const itemId = (formData.get('itemId') as string) ?? '';
		const items = await requireOwnedBatch(params.id, locals);
		const item = items.find(i => i.id === itemId);
		if (item) {
			trackEvent('extraction_discarded', item.restaurantId, { files: [item.displayName] });
			await getStorage().delete(item.fileKey);
			await markDiscarded(item.id);
			if (await isBatchSettled(params.id)) await settledRedirect(params.id);
		}
		redirect(303, `/batch/${params.id}`);
	},

	discardBatch: async ({ params, locals }) => {
		const items = await requireOwnedBatch(params.id, locals);
		const rid = locals.restaurantId!;
		trackEvent('extraction_discarded', rid, { files: items.map(i => i.displayName) });
		for (const i of items) {
			if (i.status !== 'confirmed') await deleteUploadFile(i.fileKey);
		}
		await deleteBatch(params.id, rid);
		redirect(303, '/');
	},

	add: async ({ params, request, locals }) => {
		const items = await requireOwnedBatch(params.id, locals);

		const formData = await request.formData();
		const rawFiles = formData.getAll('files');
		const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).size > 0);
		if (files.length === 0) return fail(400, { error: 'No valid files received.' });

		const { saved, keys } = await saveUploadedFiles(files, params.id);
		if (saved.length > 0) {
			const added = await addItems(params.id, items[0].restaurantId, saved.map((name, i) => ({ key: keys[i], name })));
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
		const rid = locals.restaurantId!;
		const items = await requireOwnedBatch(params.id, locals);
		const item = items.find(i => i.id === itemId);
		if (item) {
			const removed = await removeItem(item.id, rid);
			if (removed) await deleteUploadFile(removed.fileKey);
		}
		const left = (await getBatchItems(params.id))
			.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
		if (!left.length) {
			await deleteBatch(params.id, rid);
			redirect(303, '/');
		}
		redirect(303, `/batch/${params.id}`);
	},
};
