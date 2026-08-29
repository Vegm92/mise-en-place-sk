import { count } from 'drizzle-orm';
import { db } from './db';
import { waitlist } from './schema';
import type { Attribution } from '$lib/attribution';

export async function insertWaitlistEmail(email: string, attribution?: Attribution): Promise<boolean> {
	const result = await db.insert(waitlist)
		.values({
			email,
			source:      attribution?.source ?? null,
			campaign:    attribution?.campaign ?? null,
			variant:     attribution?.variant ?? null,
			segment:     attribution?.segment ?? null,
			referrer:    attribution?.referrer ?? null,
			landingPath: attribution?.landingPath ?? null,
			referredBy:  attribution?.referredBy ?? null,
		})
		.onConflictDoNothing()
		.returning({ id: waitlist.id });
	return result.length > 0;
}

export async function countWaitlistEmails(): Promise<number> {
	const [row] = await db.select({ n: count() }).from(waitlist);
	return Number(row?.n ?? 0);
}
