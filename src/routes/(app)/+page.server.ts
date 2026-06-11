import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { randomBytes } from 'crypto';
import { writeSession, saveUploadedFiles } from '$lib/server/sessions';

export const load: PageServerLoad = async ({ url }) => {
	return {
		title: 'Upload Invoice',
		error: url.searchParams.get('error') ?? null,
		saved: url.searchParams.get('saved') === '1',
		duplicate: url.searchParams.get('duplicate_inv') === '1',
	};
};

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

		const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
		const oversized = files.filter(f => f.size > MAX_UPLOAD_BYTES);
		if (oversized.length > 0) {
			const names = oversized.map(f => f.name).join(', ');
			return fail(400, { error: `File${oversized.length > 1 ? 's' : ''} exceed the 20 MB limit: ${names}` });
		}

		// Generate the first session ID before saving so it can be used as the storage namespace.
		const firstId = randomBytes(16).toString('hex');

		let saved: string[];
		let keys: string[];
		let errors: string[];
		try {
			({ saved, keys, errors } = await saveUploadedFiles(files, firstId));
		} catch (err) {
			return fail(500, { error: `File save failed: ${err instanceof Error ? err.message : String(err)}` });
		}

		if (saved.length === 0) {
			const msg = errors.length > 0 ? errors.join('; ') : 'No valid files received. Please select a PDF, JPG, or PNG.';
			return fail(400, { error: msg });
		}

		if (saved.length === 1) {
			await writeSession({ id: firstId, files: saved, fileKeys: keys });
		} else {
			// Multi-file batch: one session per invoice, chained via `remaining`
			const total = saved.length;
			const ids = [firstId, ...saved.slice(1).map(() => randomBytes(16).toString('hex'))];
			for (let i = 0; i < saved.length; i++) {
				await writeSession({
					id: ids[i],
					files: [saved[i]],
					fileKeys: [keys[i]],
					invoiceIndex: i + 1,
					totalInvoices: total,
					remaining: ids.slice(i + 1),
				});
			}
		}

		redirect(303, `/confirm/${firstId}`);
	},
};
