import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { randomBytes } from 'crypto';
import path from 'node:path';
import { saveUploadedFiles } from '$lib/server/sessions';
import { createBatch } from '$lib/server/batch';
import { trackEvent } from '$lib/server/events';

export const load: PageServerLoad = async ({ url }) => {
	return {
		title: 'Upload Invoice',
		error: url.searchParams.get('error') ?? null,
		saved: url.searchParams.get('saved') === '1',
		duplicate: url.searchParams.get('duplicate_inv') === '1',
	};
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
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

		const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
		const oversized = files.filter(f => f.size > MAX_UPLOAD_BYTES);
		if (oversized.length > 0) {
			const names = oversized.map(f => f.name).join(', ');
			return fail(400, { error: `File${oversized.length > 1 ? 's' : ''} exceed the 20 MB limit: ${names}` });
		}

		// Random storage namespace — generated before the batch exists so files
		// can be saved first; it does not need to match the batch id.
		const namespace = randomBytes(16).toString('hex');

		let saved: string[];
		let keys: string[];
		let errors: string[];
		try {
			({ saved, keys, errors } = await saveUploadedFiles(files, namespace));
		} catch (err) {
			return fail(500, { error: `File save failed: ${err instanceof Error ? err.message : String(err)}` });
		}

		if (saved.length === 0) {
			const msg = errors.length > 0 ? errors.join('; ') : 'No valid files received. Please select a PDF, JPG, or PNG.';
			return fail(400, { error: msg });
		}

		const rid = locals.restaurantId!;
		// One batch, one item per invoice — no chained sessions.
		const { itemIds } = await createBatch(rid, saved.map((name, i) => ({ key: keys[i], name })));

		const exts = [...new Set(saved.map(f => path.extname(f).toLowerCase()))];
		trackEvent('file_uploaded', rid, { count: saved.length, exts });

		redirect(303, `/confirm/${itemIds[0]}`);
	},
};
