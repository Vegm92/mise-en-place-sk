import { count } from 'drizzle-orm';
import { db } from './db';
import { waitlist } from './schema';

export async function insertWaitlistEmail(email: string): Promise<boolean> {
	const result = await db.insert(waitlist)
		.values({ email })
		.onConflictDoNothing()
		.returning({ id: waitlist.id });
	return result.length > 0;
}

export async function countWaitlistEmails(): Promise<number> {
	const [row] = await db.select({ n: count() }).from(waitlist);
	return Number(row?.n ?? 0);
}
