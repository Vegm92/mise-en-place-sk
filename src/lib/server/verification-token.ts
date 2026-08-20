import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from './db';
import { verificationTokens } from './schema/auth';

const TOKEN_TTL_MS = 60 * 60 * 1000;

export async function createVerificationToken(identifier: string): Promise<string> {
	await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));

	const token = randomBytes(32).toString('hex');
	await db.insert(verificationTokens).values({
		identifier,
		token,
		expires: new Date(Date.now() + TOKEN_TTL_MS),
	});
	return token;
}

export async function consumeVerificationToken(identifier: string, token: string): Promise<boolean> {
	const deleted = await db
		.delete(verificationTokens)
		.where(and(
			eq(verificationTokens.identifier, identifier),
			eq(verificationTokens.token, token),
			gt(verificationTokens.expires, new Date()),
		))
		.returning();

	return deleted.length > 0;
}
