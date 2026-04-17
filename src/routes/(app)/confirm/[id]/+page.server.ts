import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { UPLOADS_DIR } from '$lib/server/env';
import { readSession, writeSession, deleteSession } from '$lib/server/sessions';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

function uploadsDir(): string {
	return path.resolve(process.cwd(), UPLOADS_DIR);
}

function humanSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileType(ext: string): string {
	const e = ext.toLowerCase().replace('.', '');
	return (e === 'jpeg' ? 'jpg' : e).toUpperCase();
}

async function saveUploadedFiles(files: File[]): Promise<{ saved: string[]; errors: string[] }> {
	const dir = uploadsDir();
	fs.mkdirSync(dir, { recursive: true });
	const saved: string[] = [];
	const errors: string[] = [];

	for (const file of files) {
		if (!file.name) continue;
		const ext = path.extname(file.name).toLowerCase();
		if (!ALLOWED_EXTENSIONS.has(ext)) {
			errors.push(`'${file.name}': unsupported type '${ext}'`);
			continue;
		}
		let dest = path.join(dir, file.name);
		if (fs.existsSync(dest)) {
			const suffix = randomBytes(3).toString('hex');
			const stem = path.basename(file.name, ext);
			dest = path.join(dir, `${stem}_${suffix}${ext}`);
		}
		const buf = Buffer.from(await file.arrayBuffer());
		fs.writeFileSync(dest, buf);
		saved.push(path.basename(dest));
	}

	return { saved, errors };
}

export const load: PageServerLoad = async ({ params }) => {
	const session = readSession(params.id);
	if (!session) {
		redirect(303, '/?error=Session+not+found');
	}

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

		const dir = uploadsDir();
		const fp = path.resolve(dir, filename);
		if (fp.startsWith(dir) && fs.existsSync(fp)) {
			fs.unlinkSync(fp);
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
			const dir = uploadsDir();
			for (const name of session.files) {
				const fp = path.resolve(dir, name);
				if (fp.startsWith(dir) && fs.existsSync(fp)) {
					fs.unlinkSync(fp);
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
