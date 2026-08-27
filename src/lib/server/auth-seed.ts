import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { restaurants, subscriptions, userRestaurants, users } from './schema';
import { trialDaysFor } from './billing';
import { DAY_MS } from '$lib/constants';

const AUTH_ADMIN_EMAIL = process.env.AUTH_ADMIN_EMAIL ?? '';
const AUTH_ADMIN_PASSWORD = process.env.AUTH_ADMIN_PASSWORD ?? '';
const AUTH_ADMIN_RESTAURANT_NAME = process.env.AUTH_ADMIN_RESTAURANT_NAME ?? 'Mi Restaurante';
const NODE_ENV: string = process.env.NODE_ENV ?? 'development';

export async function seedAdminUser(): Promise<void> {
	const email           = AUTH_ADMIN_EMAIL;
	const password        = AUTH_ADMIN_PASSWORD;
	const restaurantName  = AUTH_ADMIN_RESTAURANT_NAME;

	if (!email || !password) return;

	if (password === 'changeme' && NODE_ENV === 'production') {
		throw new Error('[auth-seed] AUTH_ADMIN_PASSWORD is still the default "changeme" — refusing to start in production. Set a strong password in your environment.');
	}

	if (/@example\.(com|org|net)$/i.test(email) && NODE_ENV === 'production') {
		throw new Error(`[auth-seed] AUTH_ADMIN_EMAIL is still a placeholder address (${email}) — refusing to start in production. Set a real, routable admin address.`);
	}

	const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
	if (existing) return;

	const passwordHash = await bcrypt.hash(password, 12);
	const [created] = await db
		.insert(users)
		.values({ email, passwordHash, emailVerified: new Date(), accessStatus: 'approved' })
		.returning();

	if (!created) {
		console.error('[auth-seed] Failed to create admin user');
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
		userId:       created.id,
		restaurantId: restaurant.id,
		role:         'owner',
	});

	const trialEndsAt = new Date(Date.now() + trialDaysFor(created.founder ?? false) * DAY_MS);
	await db.insert(subscriptions).values({
		restaurantId: restaurant.id,
		status:       'trialing',
		trialEndsAt,
	});

	console.log(`[auth-seed] Admin seeded OK → restaurant "${restaurantName}"`);
}
