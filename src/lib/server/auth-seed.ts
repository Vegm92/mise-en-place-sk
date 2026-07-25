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

	if (password === 'changeme' && process.env['NODE_ENV'] === 'production') {
		throw new Error('[auth-seed] AUTH_ADMIN_PASSWORD is still the default "changeme" — refusing to start in production. Set a strong password in your environment.');
	}

	// AUTH_ADMIN_EMAIL also gates /admin and receives password-reset mail, so a
	// placeholder address means an admin account nobody can recover (issue #295).
	if (/@example\.(com|org|net)$/i.test(email) && process.env['NODE_ENV'] === 'production') {
		throw new Error(`[auth-seed] AUTH_ADMIN_EMAIL is still a placeholder address (${email}) — refusing to start in production. Set a real, routable admin address.`);
	}

	// Skip if Supabase is unreachable (local dev without credentials).
	// Doing a DNS check avoids the SDK's retry loop which generates unhandled
	// promise rejections as a side effect even when the final error is caught.
	const supabaseHost = new URL(env.SUPABASE_URL!).hostname;
	try {
		const { promises: dns } = await import('dns');
		await dns.lookup(supabaseHost);
	} catch {
		console.warn('[auth-seed] Supabase unreachable — skipping admin seed (local dev)');
		return;
	}

	const supabase = createSupabaseAdminClient();

	// Check if user already exists
	const { data: existing, error: listError } = await supabase.auth.admin.listUsers();
	if (listError) {
		console.warn('[auth-seed] Could not list users — skipping admin seed:', listError.message);
		return;
	}
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
