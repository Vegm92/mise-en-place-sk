import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema/auth';

// A missing claim (e.g. a cookie from issueSessionCookie) is healed to the current version rather than rejected.
export async function checkTokenVersion(userId: string, claimedVersion: number | undefined): Promise<number | null> {
	const [row] = await db.select({ tokenVersion: users.tokenVersion })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!row) return null;
	if (typeof claimedVersion === 'number' && claimedVersion !== row.tokenVersion) return null;

	return row.tokenVersion;
}
