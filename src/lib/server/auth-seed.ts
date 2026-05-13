import { env } from '$env/dynamic/private';
import { dbClient } from './db';
import { randomUUID } from 'crypto';

export async function seedAdminUser(): Promise<void> {
	const email    = env.AUTH_ADMIN_EMAIL;
	const password = env.AUTH_ADMIN_PASSWORD;
	if (!email || !password) return;

	const existing = dbClient
		.prepare('SELECT id FROM "user" WHERE email = ?')
		.get(email) as { id: string } | undefined;
	if (existing) return;

	const { hashPassword } = await import('better-auth/crypto');
	const hashed           = await hashPassword(password);
	const now      = new Date().toISOString();
	const userId   = randomUUID();
	const accId    = randomUUID();

	dbClient.prepare(
		`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
		 VALUES (?, ?, ?, 1, ?, ?)`
	).run(userId, email.split('@')[0], email, now, now);

	dbClient.prepare(
		`INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
		 VALUES (?, ?, 'credential', ?, ?, ?, ?)`
	).run(accId, userId, userId, hashed, now, now);

	console.log(`[auth] Admin user seeded: ${email}`);
}
