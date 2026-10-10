import { error } from '@sveltejs/kit';
import path from 'path';
import type { RequestHandler } from './$types';
import { getStorage } from '$lib/server/storage';
import { db, forTenant } from '$lib/server/db';
import { invoices } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { contentDispositionHeader } from '$lib/server/content-disposition';
import { requirePositiveIntId } from '$lib/server/route-params';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { resolveMimeType } from '$lib/server/file-validation';

export const GET: RequestHandler = async ({ params, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) error(401, 'Unauthorized');

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'invoice-file-download', max: 60 }, { restaurantId: rid }))) {
		throw error(429, 'Too many requests');
	}

	const id = requirePositiveIntId(params.id, 'invoice');

	const tdb = forTenant(rid);
	const rows = await db.select({ sourceFile: invoices.sourceFile })
		.from(invoices)
		.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)))
		.limit(1);

	if (!rows.length || !rows[0]!.sourceFile) error(404, 'No source file for this invoice');

	const key = rows[0]!.sourceFile;

	let buf: Buffer;
	try {
		buf = await getStorage().read(key);
	} catch {
		throw error(404, 'File not found');
	}

	const mimeType = resolveMimeType(key);

	return new Response(new Uint8Array(buf), {
		headers: {
			'Content-Type':           mimeType,
			'Content-Disposition':    contentDispositionHeader('inline', path.basename(key)),
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control':          'private, no-store',
		},
	});
};
