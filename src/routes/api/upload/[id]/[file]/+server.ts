import { error } from '@sveltejs/kit';
import path from 'path';
import { getItem } from '$lib/server/batch';
import { getStorage } from '$lib/server/storage';
import { contentDispositionHeader } from '$lib/server/content-disposition';
import type { RequestHandler } from './$types';

const MIME: Record<string, string> = {
	'.pdf':  'application/pdf',
	'.jpg':  'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png':  'image/png',
};

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const item = await getItem(params.id);
	if (!item || item.restaurantId !== locals.restaurantId) throw error(404, 'Item not found');

	const rawFile = params.file;
	const filename = path.basename(rawFile);
	if (filename !== rawFile || filename !== item.displayName) throw error(403, 'File not in batch item');

	const key = item.fileKey;

	const ext = path.extname(filename).toLowerCase();
	const contentType = MIME[ext] ?? 'application/octet-stream';

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
			'Cache-Control': 'private, no-store',
		},
	});
};
