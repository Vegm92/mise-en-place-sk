import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { restaurants, userRestaurants, users } from './schema';
import { config } from './env';

export async function seedAdminUser(): Promise<void> {
	const email           = config.auth.adminEmail;
	const password        = config.auth.adminPassword;
	const restaurantName  = config.auth.adminRestaurantName;

	if (!email || !password) return;

	if (password === 'changeme' && config.app.nodeEnv === 'production') {
		throw new Error('[auth-seed] AUTH_ADMIN_PASSWORD is still the default "changeme" — refusing to start in production. Set a strong password in your environment.');
	}

	if (/@example\.(com|org|net)$/i.test(email) && config.app.nodeEnv === 'production') {
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

	console.log(`[auth-seed] Admin seeded OK → restaurant "${restaurantName}"`);
}
