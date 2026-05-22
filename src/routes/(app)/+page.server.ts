import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { writeSession, uploadsDir } from '$lib/server/sessions';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const load: PageServerLoad = async ({ url }) => {
	return {
		title: 'Upload Invoice',
		error: url.searchParams.get('error') ?? null,
		saved: url.searchParams.get('saved') === '1',
		duplicate: url.searchParams.get('duplicate_inv') === '1',
	};
};

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
		if (file.size > MAX_FILE_BYTES) {
			errors.push(`'${file.name}': exceeds the 20 MB limit`);
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

export const actions: Actions = {
	upload: async ({ request }) => {
		let formData: FormData;
		try {
			formData = await request.formData();
		} catch {
			return fail(400, { error: 'Could not parse form data. Please try again.' });
		}

		const rawFiles = formData.getAll('files');
		// Use typeof check instead of instanceof — SvelteKit's internal File class may differ
		// from globalThis.File across Node.js versions, causing instanceof to silently drop files.
		const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).size > 0);

		if (files.length === 0) {
			return fail(400, { error: 'No valid files received. Please select a PDF, JPG, or PNG.' });
		}

		let saved: string[];
		let errors: string[];
		try {
			({ saved, errors } = await saveUploadedFiles(files));
		} catch (err) {
			return fail(500, { error: `File save failed: ${err instanceof Error ? err.message : String(err)}` });
		}

		if (saved.length === 0) {
			const msg = errors.length > 0 ? errors.join('; ') : 'No valid files received. Please select a PDF, JPG, or PNG.';
			return fail(400, { error: msg });
		}

		const id = randomBytes(16).toString('hex');
		writeSession({ id, files: saved });

		redirect(303, `/confirm/${id}`);
	},
};
