import { randomBytes } from 'node:crypto';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { waitlist } from './schema';
import type { Attribution } from '$lib/attribution';

const REFERRAL_CODE_BYTES = 9;

export function generateReferralCode(): string {
	return randomBytes(REFERRAL_CODE_BYTES).toString('base64url');
}

export async function insertWaitlistEmail(email: string, attribution?: Attribution): Promise<boolean> {
	const result = await db.insert(waitlist)
		.values({
			email,
			source:       attribution?.source ?? null,
			campaign:     attribution?.campaign ?? null,
			variant:      attribution?.variant ?? null,
			segment:      attribution?.segment ?? null,
			referrer:     attribution?.referrer ?? null,
			landingPath:  attribution?.landingPath ?? null,
			referredBy:   attribution?.referredBy ?? null,
			referralCode: generateReferralCode(),
		})
		.onConflictDoNothing()
		.returning({ id: waitlist.id });
	return result.length > 0;
}

export async function countWaitlistEmails(): Promise<number> {
	const [row] = await db.select({ n: count() }).from(waitlist);
	return Number(row?.n ?? 0);
}

export async function getReferralCode(email: string): Promise<string | null> {
	const [row] = await db.select({ referralCode: waitlist.referralCode }).from(waitlist).where(eq(waitlist.email, email)).limit(1);
	if (!row) return null;
	if (row.referralCode) return row.referralCode;

	const [backfilled] = await db.update(waitlist)
		.set({ referralCode: generateReferralCode() })
		.where(and(eq(waitlist.email, email), isNull(waitlist.referralCode)))
		.returning({ referralCode: waitlist.referralCode });
	if (backfilled) return backfilled.referralCode;

	const [after] = await db.select({ referralCode: waitlist.referralCode }).from(waitlist).where(eq(waitlist.email, email)).limit(1);
	return after?.referralCode ?? null;
}

export async function resolveReferralOwnerEmail(code: string): Promise<string | null> {
	const [row] = await db.select({ email: waitlist.email }).from(waitlist).where(eq(waitlist.referralCode, code)).limit(1);
	return row?.email ?? null;
}
