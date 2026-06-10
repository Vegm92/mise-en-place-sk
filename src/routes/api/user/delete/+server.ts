import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { userRestaurants, restaurants, subscriptions } from '$lib/server/schema';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import { eq, inArray } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

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

	// Delete owned restaurants (cascades to all business data via FK)
	if (ownedIds.length > 0) {
		// Check no restaurant has other members before cascade-deleting
		await db.delete(subscriptions).where(inArray(subscriptions.restaurantId, ownedIds));
		await db.delete(restaurants).where(inArray(restaurants.id, ownedIds));
	}

	// Remove user from any restaurants they're a member of (but don't own)
	await db.delete(userRestaurants).where(eq(userRestaurants.userId, user.id));

	// Delete the Supabase Auth account (must be last)
	const admin = createSupabaseAdminClient();
	const { error: authError } = await admin.auth.admin.deleteUser(user.id);
	if (authError) {
		console.error('[account-delete] auth delete failed', authError);
		throw error(500, 'Account deletion partially failed — contact support');
	}

	return json({ deleted: true });
};
