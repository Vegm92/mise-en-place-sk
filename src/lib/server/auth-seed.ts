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
	const hashed  = await hashPassword(password);
	const nowMs   = Date.now();   // INTEGER Unix ms — matches timestamp mode schema
	const userId  = randomUUID();
	const accId   = randomUUID();

	dbClient.prepare(
		`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
		 VALUES (?, ?, ?, 1, ?, ?)`
	).run(userId, email.split('@')[0], email, nowMs, nowMs);

	dbClient.prepare(
		`INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
		 VALUES (?, ?, 'credential', ?, ?, ?, ?)`
	).run(accId, email, userId, hashed, nowMs, nowMs);

	console.log(`[auth] Admin user seeded: ${email}`);
}
