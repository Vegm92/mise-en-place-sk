import { env } from '$env/dynamic/private';
import { createSupabaseAdminClient } from './supabase';
import { db } from './db';
import { restaurants, userRestaurants } from './schema';
import { eq } from 'drizzle-orm';

/**
 * Seeds the initial admin user and default restaurant on first startup.
 * Requires AUTH_ADMIN_EMAIL, AUTH_ADMIN_PASSWORD, and AUTH_ADMIN_RESTAURANT_NAME.
 * No-ops if the user already exists in Supabase Auth.
 */
export async function seedAdminUser(): Promise<void> {
	const email        = env.AUTH_ADMIN_EMAIL;
	const password     = env.AUTH_ADMIN_PASSWORD;
	const restaurantName = env.AUTH_ADMIN_RESTAURANT_NAME ?? 'Mi Restaurante';

	if (!email || !password) return;

	const supabase = createSupabaseAdminClient();

	// Check if user already exists
	const { data: existing } = await supabase.auth.admin.listUsers();
	const alreadyExists = existing?.users?.some(u => u.email === email);
	if (alreadyExists) return;

	// Create the user in Supabase Auth
	const { data: created, error } = await supabase.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
	});

	if (error || !created?.user) {
		console.error('[auth-seed] Failed to create admin user:', error?.message);
		return;
	}

	// Create default restaurant
	const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	const [restaurant] = await db
		.insert(restaurants)
		.values({ name: restaurantName, slug })
		.returning();

	if (!restaurant) {
		console.error('[auth-seed] Failed to create default restaurant');
		return;
	}

	// Link user → restaurant
	await db.insert(userRestaurants).values({
		userId:       created.user.id,
		restaurantId: restaurant.id,
		role:         'owner',
	});

	console.log(`[auth-seed] Admin seeded OK → restaurant "${restaurantName}"`);
}
