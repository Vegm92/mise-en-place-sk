import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { readSession, uploadsDir } from '$lib/server/sessions';
import type { RequestHandler } from './$types';

const MIME: Record<string, string> = {
	'.pdf':  'application/pdf',
	'.jpg':  'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png':  'image/png',
};

export const GET: RequestHandler = async ({ params }) => {
	const session = readSession(params.id);
	if (!session) throw error(404, 'Session not found');

	const filename = params.file;
	if (!session.files.includes(filename)) throw error(403, 'File not in session');

	const dir = uploadsDir();
	const fp = path.resolve(dir, filename);
	// Path traversal guard
	if (!fp.startsWith(dir + path.sep) && fp !== dir) throw error(400, 'Invalid path');

	if (!fs.existsSync(fp)) throw error(404, 'File not found');

	const ext = path.extname(filename).toLowerCase();
	const contentType = MIME[ext] ?? 'application/octet-stream';
	const buf = fs.readFileSync(fp);

	return new Response(buf, {
		headers: {
			'Content-Type': contentType,
			'Content-Disposition': 'inline',
			'Cache-Control': 'private, no-store',
		},
	});
};
