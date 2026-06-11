import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import { readSession, writeSession, deleteSession, localFilePath, saveUploadedFiles, deleteUploadFile } from '$lib/server/sessions';
import { enqueueExtraction } from '$lib/server/queue';
import { computeFileHash } from '$lib/server/dedup';
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

export const load: PageServerLoad = async ({ params }) => {
	try {
		const session = await readSession(params.id);
		if (!session) redirect(303, '/?error=Session+not+found');

		function mapFiles(names: string[], fileKeys: string[], queued: boolean) {
			return names.map((name, i) => {
				const key = fileKeys[i] ?? name;
				let size = '—';
				const type = fileType(path.extname(name));
				if (STORAGE_DRIVER === 'local') {
					try {
						const fp = localFilePath(key);
						if (fs.existsSync(fp)) {
							size = humanSize(fs.statSync(fp).size);
						}
					} catch {
						// ignore stat errors — size stays '—'
					}
				}
				return { name, size, type, queued };
			});
		}

		const sessionKeys = session.fileKeys ?? session.files;
		const files = mapFiles(session.files, sessionKeys, false);

		// Include files from remaining sessions so the queue shows the full batch
		let cur = session;
		while (cur.remaining?.length) {
			const next = await readSession(cur.remaining[0]);
			if (!next) break;
			const nextKeys = next.fileKeys ?? next.files;
			files.push(...mapFiles(next.files, nextKeys, true));
			cur = next;
		}

		return {
			title: 'Review Files',
			id: params.id,
			files,
			invoiceIndex:  session.invoiceIndex  ?? 1,
			totalInvoices: session.totalInvoices ?? 1,
			remaining:     session.remaining     ?? [],
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[confirm] load failed', e);
		error(500, 'Failed to load upload session');
	}
};

export const actions: Actions = {
	add: async ({ params, request }) => {
		const session = await readSession(params.id);
		if (!session) redirect(303, '/?error=Session+not+found');

		const formData = await request.formData();
		const rawFiles = formData.getAll('files');
		const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).size > 0);

		if (files.length === 0) {
			return fail(400, { error: 'No valid files received.' });
		}

		const { saved, keys } = await saveUploadedFiles(files, params.id);
		if (saved.length > 0) {
			await writeSession({
				...session,
				files: [...session.files, ...saved],
				fileKeys: [...(session.fileKeys ?? session.files), ...keys],
			});
		}

		redirect(303, `/confirm/${params.id}`);
	},

	remove: async ({ params, request }) => {
		const session = await readSession(params.id);
		if (!session) redirect(303, '/');

		const formData = await request.formData();
		const filename = formData.get('filename') as string;
		if (!filename) redirect(303, `/confirm/${params.id}`);

		const idx = session.files.indexOf(filename);
		if (idx !== -1) {
			const key = session.fileKeys?.[idx] ?? filename;
			await deleteUploadFile(key);
		}

		const remainingFiles = session.files.filter((f) => f !== filename);
		const remainingKeys = (session.fileKeys ?? session.files).filter((_, i) => session.files[i] !== filename);

		if (remainingFiles.length === 0) {
			await deleteSession(params.id);
			redirect(303, '/');
		}

		await writeSession({ ...session, files: remainingFiles, fileKeys: remainingKeys });
		redirect(303, `/confirm/${params.id}`);
	},

	discard: async ({ params }) => {
		// Walk the full chain and delete every session + its files
		const toDelete: string[] = [params.id];
		let cur = await readSession(params.id);
		while (cur?.remaining?.length) {
			toDelete.push(...cur.remaining);
			cur = await readSession(cur.remaining[0]);
		}
		for (const id of toDelete) {
			const s = await readSession(id);
			if (!s) continue;
			const fileKeys = s.fileKeys ?? s.files;
			for (const key of fileKeys) {
				await deleteUploadFile(key);
			}
			await deleteSession(id);
		}
		redirect(303, '/');
	},

	extract: async ({ params, locals }) => {
		const session = await readSession(params.id);
		if (!session) redirect(303, '/?error=Session+not+found');
		const rid = locals.restaurantId!;

		// Compute file hash for in-flight dedup: if the exact same bytes are
		// already being processed, pg-boss singletonKey silently drops the job.
		// We detect that and mark the session as failed so the extract page can
		// show the 'already extracting' error instead of polling forever.
		// File hashing for in-flight dedup only works with local storage.
		// With Supabase storage the file isn't on disk, so we skip it (dedup falls back to no singletonKey).
		let fileHash: string | undefined;
		if (STORAGE_DRIVER === 'local') {
			const key = session.fileKeys?.[0] ?? session.files[0];
			const firstFilePath = localFilePath(key);
			if (fs.existsSync(firstFilePath)) fileHash = computeFileHash(firstFilePath);
		}

		await writeSession({ ...session, extractionStatus: 'queued' });
		const enqueued = await enqueueExtraction(params.id, rid, fileHash);
		if (!enqueued) {
			await writeSession({ ...session, extractionStatus: 'failed', extractError: 'extract.err.alreadyExtracting' });
		}
		redirect(303, `/extract/${params.id}`);
	},
};
