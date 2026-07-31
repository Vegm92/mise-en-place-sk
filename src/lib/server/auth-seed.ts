import { env } from '$env/dynamic/private';
import { createSupabaseAdminClient } from './supabase';
import { db } from './db';
import { restaurants, userRestaurants } from './schema';
import { eq } from 'drizzle-orm';

export async function seedAdminUser(): Promise<void> {
	const email        = env.AUTH_ADMIN_EMAIL;
	const password     = env.AUTH_ADMIN_PASSWORD;
	const restaurantName = env.AUTH_ADMIN_RESTAURANT_NAME ?? 'Mi Restaurante';

	if (!email || !password) return;

	if (password === 'changeme' && process.env['NODE_ENV'] === 'production') {
		throw new Error('[auth-seed] AUTH_ADMIN_PASSWORD is still the default "changeme" — refusing to start in production. Set a strong password in your environment.');
	}

	if (/@example\.(com|org|net)$/i.test(email) && process.env['NODE_ENV'] === 'production') {
		throw new Error(`[auth-seed] AUTH_ADMIN_EMAIL is still a placeholder address (${email}) — refusing to start in production. Set a real, routable admin address.`);
	}

	const supabaseHost = new URL(env.SUPABASE_URL!).hostname;
	try {
		const { promises: dns } = await import('dns');
		await dns.lookup(supabaseHost);
	} catch {
		console.warn('[auth-seed] Supabase unreachable — skipping admin seed (local dev)');
		return;
	}

	const supabase = createSupabaseAdminClient();

	const { data: existing, error: listError } = await supabase.auth.admin.listUsers();
	if (listError) {
		console.warn('[auth-seed] Could not list users — skipping admin seed:', listError.message);
		return;
	}
	const alreadyExists = existing?.users?.some(u => u.email === email);
	if (alreadyExists) return;

	const { data: created, error } = await supabase.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
	});

	if (error || !created?.user) {
		console.error('[auth-seed] Failed to create admin user:', error?.message);
		return;
	}

	const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	const [restaurant] = await db
		.insert(restaurants)
		.values({ name: restaurantName, slug })
		.returning();

	if (!restaurant) {
		console.error('[auth-seed] Failed to create default restaurant');
		return;
	}

	await db.insert(userRestaurants).values({
		userId:       created.user.id,
		restaurantId: restaurant.id,
		role:         'owner',
	});

	console.log(`[auth-seed] Admin seeded OK → restaurant "${restaurantName}"`);
}
