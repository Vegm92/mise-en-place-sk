/**
 * T&C / Privacy Policy consent recording (GDPR, issue #201).
 * Every sign-up path must leave a row in user_consents before the user
 * starts using the product: email sign-ups at form submit, Google OAuth
 * sign-ups at the auth callback (signup page) or at onboarding (login page).
 */
import { eq } from 'drizzle-orm';
import { db } from './db';
import { userConsents } from './schema';

/** Bump when /terms or /privacy change materially; earlier acceptances stay recorded. */
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
