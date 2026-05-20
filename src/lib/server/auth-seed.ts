import { env } from '$env/dynamic/private';
import { db } from './db';
import { user, account } from './schema';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function seedAdminUser(): Promise<void> {
	const email    = env.AUTH_ADMIN_EMAIL;
	const password = env.AUTH_ADMIN_PASSWORD;
	if (!email || !password) return;

	const existing = db.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
	if (existing) return;

	const { hashPassword } = await import('better-auth/crypto');
	const hashed  = await hashPassword(password);
	const nowMs   = Date.now();   // BetterAuth stores timestamps as INTEGER Unix ms
	const userId  = randomUUID();
	const accId   = randomUUID();

	// Use raw sql to preserve Unix-ms integer format BetterAuth expects
	db.run(sql`
		INSERT INTO ${user} (id, name, email, emailVerified, createdAt, updatedAt)
		VALUES (${userId}, ${email.split('@')[0]}, ${email}, 1, ${nowMs}, ${nowMs})
	`);

	db.run(sql`
		INSERT INTO ${account} (id, accountId, providerId, userId, password, createdAt, updatedAt)
		VALUES (${accId}, ${email}, 'credential', ${userId}, ${hashed}, ${nowMs}, ${nowMs})
	`);

	console.log(`[auth] Admin user seeded: ${email}`);
}
