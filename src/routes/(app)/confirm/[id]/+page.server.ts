import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import { readSession, writeSession, deleteSession, uploadsDir, resolveUploadPath, saveUploadedFiles } from '$lib/server/sessions';

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
		const session = readSession(params.id);
		if (!session) redirect(303, '/?error=Session+not+found');

		const dir = uploadsDir();
		const files = session.files.map((name) => {
			const fp = path.join(dir, name);
			let size = '—';
			let type = 'FILE';
			if (fs.existsSync(fp)) {
				const stat = fs.statSync(fp);
				size = humanSize(stat.size);
				type = fileType(path.extname(name));
			}
			return { name, size, type };
		});

		return {
			title: 'Review Files',
			id: params.id,
			files,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[confirm] load failed', e);
		error(500, 'Failed to load upload session');
	}
};

export const actions: Actions = {
	add: async ({ params, request }) => {
		const session = readSession(params.id);
		if (!session) redirect(303, '/?error=Session+not+found');

		const formData = await request.formData();
		const rawFiles = formData.getAll('files');
		const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).size > 0);

		if (files.length === 0) {
			return fail(400, { error: 'No valid files received.' });
		}

		const { saved } = await saveUploadedFiles(files);
		if (saved.length > 0) {
			writeSession({ ...session, files: [...session.files, ...saved] });
		}

		redirect(303, `/confirm/${params.id}`);
	},

	remove: async ({ params, request }) => {
		const session = readSession(params.id);
		if (!session) redirect(303, '/');

		const formData = await request.formData();
		const filename = formData.get('filename') as string;
		if (!filename) redirect(303, `/confirm/${params.id}`);

		try {
			const fp = resolveUploadPath(filename);
			if (fs.existsSync(fp)) fs.unlinkSync(fp);
		} catch {
			// path invalid — skip deletion
		}

		const remaining = session.files.filter((f) => f !== filename);
		if (remaining.length === 0) {
			deleteSession(params.id);
			redirect(303, '/');
		}

		writeSession({ ...session, files: remaining });
		redirect(303, `/confirm/${params.id}`);
	},

	discard: async ({ params }) => {
		const session = readSession(params.id);
		if (session) {
			for (const name of session.files) {
				try {
					const fp = resolveUploadPath(name);
					if (fs.existsSync(fp)) fs.unlinkSync(fp);
				} catch {
					// path invalid — skip
				}
			}
			deleteSession(params.id);
		}
		redirect(303, '/');
	},

	extract: async ({ params }) => {
		redirect(303, `/extract/${params.id}`);
	},
};
