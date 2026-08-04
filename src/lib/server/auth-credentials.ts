import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema/auth';

export async function verifyCredentials(email: string, password: string) {
	const normalizedEmail = email.toLowerCase().trim();
	if (!normalizedEmail || !password) return null;

	const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
	if (!user?.passwordHash || !user.emailVerified) return null;

	const valid = await bcrypt.compare(password, user.passwordHash);
	if (!valid) return null;

	return { id: user.id, email: user.email, name: user.name, image: user.image };
}
