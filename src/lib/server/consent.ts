import { eq } from 'drizzle-orm';
import { db } from './db';
import { userConsents } from './schema';

export const POLICY_VERSION = '2026-07';

export type ConsentMethod = 'signup_form' | 'oauth_signup' | 'onboarding';

export async function recordConsent(userId: string, method: ConsentMethod): Promise<void> {
	await db.insert(userConsents)
		.values({ userId, policyVersion: POLICY_VERSION, method })
		.onConflictDoNothing();
}

export async function hasConsent(userId: string): Promise<boolean> {
	const rows = await db.select({ id: userConsents.id })
		.from(userConsents)
		.where(eq(userConsents.userId, userId))
		.limit(1);
	return rows.length > 0;
}
