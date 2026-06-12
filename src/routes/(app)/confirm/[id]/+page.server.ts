import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import { localFilePath, saveUploadedFiles, deleteUploadFile } from '$lib/server/sessions';
import { getItem, getBatchItems, addItems, removeItem, deleteBatch, markQueued } from '$lib/server/batch';
import { enqueueExtraction } from '$lib/server/queue';
import { enqueueBatchExtraction } from '$lib/server/extract-batch';
import { STORAGE_DRIVER } from '$lib/server/env';

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

export const load: PageServerLoad = async ({ params }) => {
	try {
		const item = await getItem(params.id);
		if (!item) redirect(303, '/?error=Session+not+found');

		const items = await getBatchItems(item.batchId);
		const open = items.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');

		const files = open.map(i => ({
			name: i.displayName,
			size: statSize(i.fileKey),
			type: fileType(path.extname(i.displayName)),
			queued: i.id !== item.id,
		}));

		const idx = open.findIndex(i => i.id === item.id);

		return {
			title: 'Review Files',
			id: params.id,
			files,
			invoiceIndex:  idx === -1 ? 1 : idx + 1,
			totalInvoices: open.length,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[confirm] load failed', e);
		error(500, 'Failed to load upload batch');
	}
};

export const actions: Actions = {
	add: async ({ params, request }) => {
		const item = await getItem(params.id);
		if (!item) redirect(303, '/?error=Session+not+found');

		const formData = await request.formData();
		const rawFiles = formData.getAll('files');
		const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).size > 0);

		if (files.length === 0) {
			return fail(400, { error: 'No valid files received.' });
		}

		const { saved, keys } = await saveUploadedFiles(files, item.batchId);
		if (saved.length > 0) {
			await addItems(item.batchId, item.restaurantId, saved.map((name, i) => ({ key: keys[i], name })));
		}

		redirect(303, `/confirm/${params.id}`);
	},

	remove: async ({ params, request }) => {
		const item = await getItem(params.id);
		if (!item) redirect(303, '/');

		const formData = await request.formData();
		const filename = formData.get('filename') as string;
		if (!filename) redirect(303, `/confirm/${params.id}`);

		const items = await getBatchItems(item.batchId);
		const target = items.find(i => i.displayName === filename && i.status === 'pending');
		if (target) {
			const removed = await removeItem(target.id);
			if (removed) await deleteUploadFile(removed.fileKey);
		}

		const left = (await getBatchItems(item.batchId))
			.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
		if (left.length === 0) {
			await deleteBatch(item.batchId);
			redirect(303, '/');
		}
		// If the current item itself was removed, continue from the first open item.
		if (!left.some(i => i.id === params.id)) redirect(303, `/confirm/${left[0].id}`);
		redirect(303, `/confirm/${params.id}`);
	},

	discard: async ({ params }) => {
		const item = await getItem(params.id);
		if (item) {
			const items = await getBatchItems(item.batchId);
			for (const i of items) {
				if (i.status !== 'confirmed') await deleteUploadFile(i.fileKey);
			}
			await deleteBatch(item.batchId);
		}
		redirect(303, '/');
	},

	extract: async ({ params, locals }) => {
		const item = await getItem(params.id);
		if (!item) redirect(303, '/?error=Session+not+found');
		const rid = locals.restaurantId!;

		// Enqueue the whole batch in one go. Idempotent: duplicate submits are
		// no-ops, and items the worker already owns are not touched.
		await enqueueBatchExtraction(params.id, rid, {
			getItem,
			getBatchItems,
			markQueued,
			enqueue: enqueueExtraction,
		});
		redirect(303, `/extract/${params.id}`);
	},
};
