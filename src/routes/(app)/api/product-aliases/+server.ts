/**
 * Confirm or reject a pending product-alias suggestion (issue #298).
 *
 * A pending suggestion (product_aliases fuzzy auto-link, or an async LLM
 * proposal, issue #300) raises a `product_suggestion` notification. The review
 * UI posts here to:
 *   - confirm (+ targetProductId): merge this description into an existing
 *       product the LLM proposed;
 *   - confirm (no target): keep the fuzzy link, mark the alias confirmed;
 *   - reject: split this description off into its own product;
 *   - dismiss: just clear the suggestion (used for LLM proposals — the line is
 *       already its own product, so declining needs no DB change).
 *
 * The notification carries the raw `description`; the raw_key is derived
 * server-side so the client never has to know the alias id.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { and, eq, sql } from 'drizzle-orm';
import { normalizeProductKey } from '$lib/server/normalize';
import { confirmProductAlias, rejectProductAlias, mergeIntoProduct } from '$lib/server/product-catalog';
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

	// 'dismiss' just clears the notification (LLM proposal declined).
	if (action === 'dismiss') {
		await dismissSuggestion(rid, normalizeProductKey(description));
		return json({ ok: true });
	}

	const result = action === 'reject'
		? await rejectProductAlias(db, rid, description)
		: targetProductId != null
			? await mergeIntoProduct(db, rid, description, targetProductId)
			: await confirmProductAlias(db, rid, description);

	if (!result.ok) return json({ error: 'No suggestion found for that description' }, { status: 404 });

	await dismissSuggestion(rid, normalizeProductKey(description));
	return json({ ok: true, productId: result.productId });
};

/** Mark the matching product_suggestion notification(s) as handled. */
async function dismissSuggestion(rid: string, rawKey: string): Promise<void> {
	const tdb = forTenant(rid);
	await db.update(systemNotifications)
		.set({ status: 'sent' })
		.where(tdb.scope(
			systemNotifications.restaurantId,
			and(
				eq(systemNotifications.notificationType, 'product_suggestion'),
				eq(systemNotifications.status, 'pending'),
				sql`mep_norm_key(${systemNotifications.payload}::json->>'description') = ${rawKey}`,
			),
		));
}
