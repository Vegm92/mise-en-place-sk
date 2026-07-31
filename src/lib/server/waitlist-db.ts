import { db } from './db';
import { waitlist } from './schema';

export async function insertWaitlistEmail(email: string): Promise<boolean> {
	const result = await db.insert(waitlist)
		.values({ email })
		.onConflictDoNothing()
		.returning({ id: waitlist.id });
	return result.length > 0;
}
