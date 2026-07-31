import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { suppliers, systemNotifications } from '$lib/server/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const POST: RequestHandler = async ({ request, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) throw error(403, 'No active restaurant');
	if (!(await checkRateLimit(`supplier-category:${rid}`, 60))) throw error(429, 'Too many requests');

	const body = await request.json().catch(() => null);
	const supplierId = typeof body?.supplierId === 'number' ? body.supplierId : null;
	const action = body?.action;
	const category = typeof body?.category === 'string' ? body.category : '';

	if (supplierId == null) return json({ error: 'supplierId required' }, { status: 422 });
	if (action !== 'accept' && action !== 'dismiss') {
		return json({ error: "action must be 'accept' or 'dismiss'" }, { status: 422 });
	}

	const tdb = forTenant(rid);

	if (action === 'accept') {
		if (!VALID_CATEGORIES.includes(category) || category === UNCATEGORIZED_CATEGORY) {
			return json({ error: 'unknown category' }, { status: 422 });
		}
		const updated = await db
			.update(suppliers)
			.set({ category })
			.where(tdb.scope(
				suppliers.restaurantId,
				and(
					eq(suppliers.id, supplierId),
					or(isNull(suppliers.category), eq(suppliers.category, UNCATEGORIZED_CATEGORY)),
				),
			))
			.returning({ id: suppliers.id });
		if (updated.length === 0) {
			await dismissSuggestion(rid, supplierId);
			return json({ error: 'supplier not found or already categorised' }, { status: 404 });
		}
	}

	await dismissSuggestion(rid, supplierId);
	return json({ ok: true });
};

async function dismissSuggestion(rid: string, supplierId: number): Promise<void> {
	const tdb = forTenant(rid);
	await db
		.update(systemNotifications)
		.set({ status: 'sent' })
		.where(tdb.scope(
			systemNotifications.restaurantId,
			and(
				eq(systemNotifications.notificationType, 'supplier_category_suggested'),
				eq(systemNotifications.status, 'pending'),
				sql`${systemNotifications.payload}::json->>'supplierId' = ${String(supplierId)}`,
			),
		));
}
