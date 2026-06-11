import { error } from '@sveltejs/kit';
import path from 'path';
import { readSession } from '$lib/server/sessions';
import { getStorage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

const MIME: Record<string, string> = {
	'.pdf':  'application/pdf',
	'.jpg':  'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png':  'image/png',
};

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const session = await readSession(params.id);
	if (!session) throw error(404, 'Session not found');

	const filename = params.file;
	const fileIdx = session.files.indexOf(filename);
	if (fileIdx === -1) throw error(403, 'File not in session');

	const key = session.fileKeys?.[fileIdx] ?? filename;

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
			'Content-Disposition': 'inline',
			'Cache-Control': 'private, no-store',
		},
	});
};
