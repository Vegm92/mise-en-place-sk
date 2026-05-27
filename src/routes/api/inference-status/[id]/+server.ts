import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { pendingProcessedInvoices } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
	const restaurantId = locals.restaurantId;
	if (!restaurantId) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const id = Number(params.id);
	if (!Number.isFinite(id)) {
		return json({ error: 'not found' }, { status: 404 });
	}

	const rows = await db
		.select({
			id: pendingProcessedInvoices.id,
			status: pendingProcessedInvoices.status,
			rawLlmJson: pendingProcessedInvoices.rawLlmJson,
		})
		.from(pendingProcessedInvoices)
		.where(and(
			eq(pendingProcessedInvoices.id, id),
			eq(pendingProcessedInvoices.restaurantId, restaurantId),
		))
		.limit(1);

	if (rows.length === 0) {
		return json({ error: 'not found' }, { status: 404 });
	}

	const record = rows[0];
	return json({
		status: record.status,
		pendingId: record.id,
		isReady: record.rawLlmJson !== null,
	});
};
