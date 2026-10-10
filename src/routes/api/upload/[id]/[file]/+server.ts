import { error } from '@sveltejs/kit';
import path from 'path';
import { getItem, UUID_RE } from '$lib/server/batch';
import { getStorage } from '$lib/server/storage';
import { contentDispositionHeader } from '$lib/server/content-disposition';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { resolveMimeType } from '$lib/server/file-validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || !locals.restaurantId) throw error(401, 'Unauthorized');

	if (!UUID_RE.test(params.id)) throw error(400, 'Invalid item ID');

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'upload-file-download', max: 60 }, { restaurantId: locals.restaurantId }))) {
		throw error(429, 'Too many requests');
	}

	const item = await getItem(params.id);
	if (!item || item.restaurantId !== locals.restaurantId) throw error(404, 'Item not found');

	const rawFile = params.file;
	const filename = path.basename(rawFile);
	if (filename !== rawFile || filename !== item.displayName) throw error(403, 'File not in batch item');

	const key = item.fileKey;

	const contentType = resolveMimeType(filename);

	let buf: Buffer;
	try {
		buf = await getStorage().read(key);
	} catch {
		throw error(404, 'File not found');
	}

	return new Response(new Uint8Array(buf), {
		headers: {
			'Content-Type': contentType,
			'Content-Disposition': contentDispositionHeader('inline', filename),
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store',
		},
	});
};
