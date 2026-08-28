import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { and, eq, sql } from 'drizzle-orm';
import { normalizeProductKey } from '$lib/server/normalize';
import { confirmProductAlias, rejectProductAlias, mergeIntoProduct } from '$lib/server/products';
import type { AliasDecision } from '$lib/server/products';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const POST: RequestHandler = async ({ request, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) throw error(403, 'No active restaurant');
	if (!(await checkRateLimit(`product-alias:${rid}`, 60))) throw error(429, 'Too many requests');

	const body = await request.json().catch(() => null);
	const description = typeof body?.description === 'string' ? body.description : '';
	const action = body?.action;
	const targetProductId = typeof body?.targetProductId === 'number' ? body.targetProductId : null;

	if (!normalizeProductKey(description)) return json({ error: 'description required' }, { status: 422 });
	if (action !== 'confirm' && action !== 'reject' && action !== 'dismiss') {
		return json({ error: "action must be 'confirm', 'reject' or 'dismiss'" }, { status: 422 });
	}

	if (action === 'dismiss') {
		await dismissSuggestion(rid, normalizeProductKey(description));
		return json({ ok: true });
	}

	let result: AliasDecision;
	if (action === 'reject') {
		result = await rejectProductAlias(db, rid, description);
	} else if (targetProductId != null) {
		result = await mergeIntoProduct(db, rid, description, targetProductId);
	} else {
		result = await confirmProductAlias(db, rid, description);
	}

	if (!result.ok) return json({ error: 'No suggestion found for that description' }, { status: 404 });

	await dismissSuggestion(rid, normalizeProductKey(description));
	return json({ ok: true, productId: result.productId });
};

async function dismissSuggestion(rid: string, rawKey: string): Promise<void> {
	const tdb = forTenant(rid);
	await db.update(systemNotifications)
		.set({ status: 'sent' })
		.where(tdb.scope(
			systemNotifications.restaurantId,
			and(
				eq(systemNotifications.notificationType, 'product_suggestion'),
				eq(systemNotifications.status, 'pending'),
				sql`mep_norm_key(${systemNotifications.payload}->>'description') = ${rawKey}`,
			),
		));
}
