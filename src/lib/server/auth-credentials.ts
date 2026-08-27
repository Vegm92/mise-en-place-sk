import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';

type SessionUser = { id: string; email: string; name: string | null; image: string | null };

async function matchPassword(email: string, password: string) {
	const normalizedEmail = email.toLowerCase().trim();
	if (!normalizedEmail || !password) return null;

	const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
	if (!user?.passwordHash) return null;

	const valid = await bcrypt.compare(password, user.passwordHash);
	if (!valid) return null;

	return user;
}

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
	const user = await matchPassword(email, password);
	if (!user || !user.emailVerified) return null;

	return { id: user.id, email: user.email, name: user.name, image: user.image };
}

export type LoginCheckResult =
	| { status: 'invalid' }
	| { status: 'unverified'; email: string }
	| { status: 'ok'; user: SessionUser };

export async function checkLoginCredentials(email: string, password: string): Promise<LoginCheckResult> {
	const user = await matchPassword(email, password);
	if (!user) return { status: 'invalid' };
	if (!user.emailVerified) return { status: 'unverified', email: user.email };

	return { status: 'ok', user: { id: user.id, email: user.email, name: user.name, image: user.image } };
}
