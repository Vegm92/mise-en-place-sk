import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { userRestaurants, restaurants, subscriptions, invoices, batchItems, whatsappBotSessions } from '$lib/server/schema';
import { getStorage } from '$lib/server/storage';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import { cancelSubscription } from '$lib/server/billing';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';

/**
 * Remove every stored file belonging to these restaurants (issue #289):
 * confirmed invoices (`invoices.source_file`), files still sitting in an upload
 * batch (`batch_items.file_key`) and WhatsApp bot captures
 * (`whatsapp_bot_sessions.file_key`). Failures are logged, never thrown — the
 * account deletion must still complete.
 */
async function deleteTenantFiles(restaurantIds: string[]): Promise<void> {
	if (restaurantIds.length === 0) return;

	const [invoiceFiles, batchFiles, whatsappFiles] = await Promise.all([
		db.select({ key: invoices.sourceFile }).from(invoices)
			.where(and(inArray(invoices.restaurantId, restaurantIds), isNotNull(invoices.sourceFile))),
		db.select({ key: batchItems.fileKey }).from(batchItems)
			.where(inArray(batchItems.restaurantId, restaurantIds)),
		db.select({ key: whatsappBotSessions.fileKey }).from(whatsappBotSessions)
			.where(and(inArray(whatsappBotSessions.restaurantId, restaurantIds), isNotNull(whatsappBotSessions.fileKey))),
	]);

	const keys = new Set<string>();
	for (const row of [...invoiceFiles, ...batchFiles, ...whatsappFiles]) {
		if (row.key) keys.add(row.key);
	}

	let failed = 0;
	for (const key of keys) {
		try {
			await getStorage().delete(key);
		} catch (err) {
			failed++;
			console.error('[account-delete] file delete failed (continuing):', err);
		}
	}
	console.info(`[account-delete] removed ${keys.size - failed}/${keys.size} stored files`);
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	// Destructive + irreversible — cap attempts to blunt accidental/abusive bursts.
	if (!(await checkRateLimit(`account-delete:${user.id}`, 3))) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	// Require explicit confirmation in request body
	const body = await request.json().catch(() => ({}));
	if (body?.confirm !== 'DELETE_MY_ACCOUNT') {
		throw error(400, 'Missing confirmation. Send { "confirm": "DELETE_MY_ACCOUNT" }');
	}

	// Collect all restaurants the user owns
	const memberships = await db
		.select({ restaurantId: userRestaurants.restaurantId, role: userRestaurants.role })
		.from(userRestaurants)
		.where(eq(userRestaurants.userId, user.id));

	const ownedIds = memberships
		.filter(m => m.role === 'owner')
		.map(m => m.restaurantId);

	// Delete owned restaurants (cascades to all business data via FK) — but
	// only those where this user is the sole member. Restaurants with other
	// members survive so one owner's account deletion can't wipe teammates' data.
	if (ownedIds.length > 0) {
		const otherMembers = await db
			.select({ restaurantId: userRestaurants.restaurantId })
			.from(userRestaurants)
			.where(and(
				inArray(userRestaurants.restaurantId, ownedIds),
				ne(userRestaurants.userId, user.id),
			));
		const shared = new Set(otherMembers.map(m => m.restaurantId));
		const soleOwnedIds = ownedIds.filter(id => !shared.has(id));

		if (soleOwnedIds.length > 0) {
			// Cancel live Stripe subscriptions BEFORE deleting the rows that link
			// the Stripe customer to the tenant — otherwise the card keeps being
			// charged for a deleted account and support can't trace it (issue #246).
			// Immediate cancellation (GDPR deletion, not cancel-at-period-end).
			const liveSubs = await db
				.select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
				.from(subscriptions)
				.where(and(
					inArray(subscriptions.restaurantId, soleOwnedIds),
					isNotNull(subscriptions.stripeSubscriptionId),
				));
			for (const s of liveSubs) {
				if (s.stripeSubscriptionId) await cancelSubscription(s.stripeSubscriptionId);
			}

			// GDPR deletion has to reach the files, not just the rows (issue
			// #289): once the restaurant row goes, the DB cascade drops every
			// pointer to the uploaded invoice PDFs and photos, and nothing would
			// ever be able to find them again. Delete them first, best-effort —
			// a storage hiccup must not block the account deletion.
			await deleteTenantFiles(soleOwnedIds);
		}

		// All row deletes commit atomically so a mid-flight failure leaves a
		// clean state to retry from, not a half-deleted account.
		await db.transaction(async (tx) => {
			if (soleOwnedIds.length > 0) {
				await tx.delete(subscriptions).where(inArray(subscriptions.restaurantId, soleOwnedIds));
				await tx.delete(restaurants).where(inArray(restaurants.id, soleOwnedIds));
			}
			// Remove the user from any restaurants they're a member of (but don't own).
			await tx.delete(userRestaurants).where(eq(userRestaurants.userId, user.id));
		});
	} else {
		// No owned restaurants — still detach the user from shared ones.
		await db.delete(userRestaurants).where(eq(userRestaurants.userId, user.id));
	}

	// Delete the Supabase Auth account (must be last — keeps the endpoint
	// retryable: the Stripe cancels and DB deletes above are all idempotent).
	const admin = createSupabaseAdminClient();
	const { error: authError } = await admin.auth.admin.deleteUser(user.id);
	if (authError) {
		console.error('[account-delete] auth delete failed', authError);
		throw error(500, 'Account deletion partially failed — contact support');
	}

	return json({ deleted: true });
};
