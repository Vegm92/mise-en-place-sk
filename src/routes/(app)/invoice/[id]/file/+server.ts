import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';
import { UPLOADS_DIR } from '$lib/server/env';
import { db } from '$lib/server/db';
import { invoices } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

const MIME: Record<string, string> = {
	pdf:  'application/pdf',
	jpg:  'image/jpeg',
	jpeg: 'image/jpeg',
	png:  'image/png',
	webp: 'image/webp',
};

export const GET: RequestHandler = async ({ params }) => {
	const id = parseInt(params.id, 10);
	if (isNaN(id)) error(400, 'Invalid invoice id');

	const rows = await db.select({ sourceFile: invoices.sourceFile })
		.from(invoices)
		.where(eq(invoices.id, id))
		.limit(1);

	if (!rows.length || !rows[0].sourceFile) error(404, 'No source file for this invoice');

	const uploadsDir = path.resolve(process.cwd(), UPLOADS_DIR);
	const filePath   = path.resolve(uploadsDir, rows[0].sourceFile);

	// Prevent directory traversal
	if (!filePath.startsWith(uploadsDir + path.sep) && filePath !== uploadsDir) {
		error(403, 'Forbidden');
	}

	if (!fs.existsSync(filePath)) error(404, 'File not found on disk');

	const ext      = path.extname(filePath).toLowerCase().replace('.', '');
	const mimeType = MIME[ext] ?? 'application/octet-stream';
	const buffer   = fs.readFileSync(filePath);

	return new Response(buffer, {
		headers: {
			'Content-Type':        mimeType,
			'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
			'Cache-Control':       'private, max-age=3600',
		},
	});
};
