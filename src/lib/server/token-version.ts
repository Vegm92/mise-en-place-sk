import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema/auth';

/**
 * Revocation check for issue #478: compares a JWT's `tokenVersion` claim
 * against `users.token_version`, bumped on password reset/change and left
 * behind (via row deletion) on account deletion.
 *
 * Returns the current version to stamp into the token when it should be
 * accepted, or `null` when it must be rejected — no row (user deleted), or a
 * claim that no longer matches (a reset/change happened since this token was
 * minted). A token with no claim yet (e.g. one minted by `issueSessionCookie`)
 * is accepted and healed to the current version.
 */
export async function checkTokenVersion(userId: string, claimedVersion: number | undefined): Promise<number | null> {
	const [row] = await db.select({ tokenVersion: users.tokenVersion })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!row) return null;
	if (typeof claimedVersion === 'number' && claimedVersion !== row.tokenVersion) return null;

	return row.tokenVersion;
}
