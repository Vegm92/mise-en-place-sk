import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';

type SessionUser = { id: string; email: string; name: string | null; image: string | null };

// Looks up the user row and checks the password only. Does NOT check
// emailVerified — callers decide what an unverified-but-correct-password
// match means for them.
async function matchPassword(email: string, password: string) {
	const normalizedEmail = email.toLowerCase().trim();
	if (!normalizedEmail || !password) return null;

	const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
	if (!user?.passwordHash) return null;

	const valid = await bcrypt.compare(password, user.passwordHash);
	if (!valid) return null;

	return user;
}

// Requires a verified account. Used by the Auth.js Credentials provider and by
// settings re-auth, where an unverified match must behave exactly like no
// match at all.
export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
	const user = await matchPassword(email, password);
	if (!user || !user.emailVerified) return null;

	return { id: user.id, email: user.email, name: user.name, image: user.image };
}

export type LoginCheckResult =
	| { status: 'invalid' }
	| { status: 'unverified'; email: string }
	| { status: 'ok'; user: SessionUser };

// Same password check as verifyCredentials, but distinguishes a CORRECT
// password on an unverified account ('unverified') from a wrong password or
// unknown email (both collapse into 'invalid'). Only the correct-password
// case may reveal that the account exists and is unverified — a wrong
// password must never leak account existence or verification state.
export async function checkLoginCredentials(email: string, password: string): Promise<LoginCheckResult> {
	const user = await matchPassword(email, password);
	if (!user) return { status: 'invalid' };
	if (!user.emailVerified) return { status: 'unverified', email: user.email };

	return { status: 'ok', user: { id: user.id, email: user.email, name: user.name, image: user.image } };
}
