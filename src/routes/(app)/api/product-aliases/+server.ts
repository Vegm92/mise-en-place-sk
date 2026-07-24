/**
 * Confirm or reject a pending product-alias suggestion (issue #298).
 *
 * A fuzzy auto-link (product_aliases.source='fuzzy', confirmed_at IS NULL)
 * raises a `product_suggestion` notification. The review UI posts here to:
 *   - confirm: keep the link, mark the alias confirmed (source='user');
 *   - reject:  split this description off into its own product and repoint any
 *              line items that were fuzzy-linked to the wrong product.
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
import { confirmProductAlias, rejectProductAlias } from '$lib/server/product-catalog';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const POST: RequestHandler = async ({ request, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) throw error(403, 'No active restaurant');
	if (!(await checkRateLimit(`product-alias:${rid}`, 60))) throw error(429, 'Too many requests');

	const body = await request.json().catch(() => null);
	const description = typeof body?.description === 'string' ? body.description : '';
	const action = body?.action;

	if (!normalizeProductKey(description)) return json({ error: 'description required' }, { status: 422 });
	if (action !== 'confirm' && action !== 'reject') {
		return json({ error: "action must be 'confirm' or 'reject'" }, { status: 422 });
	}

	const result = action === 'confirm'
		? await confirmProductAlias(db, rid, description)
		: await rejectProductAlias(db, rid, description);

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
