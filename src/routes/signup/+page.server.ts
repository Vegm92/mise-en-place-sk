import { redirect, fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import type { Actions, PageServerLoad } from './$types';
import { recordConsent } from '$lib/server/consent';
import { publicFormAction } from '$lib/server/public-form-action';
import { resendVerificationAction } from '$lib/server/resend-verification-action';
import { passwordPolicyError } from '$lib/server/password-policy';
import { logAuthEvent } from '$lib/server/auth-events';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { sendVerificationEmail } from '$lib/server/verification-email';
import { signIn } from '$lib/server/auth';
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '$lib/attribution';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, locals.restaurantId ? '/' : '/onboarding');
	return {};
};

const SignUpForm = v.object({
	email: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
	password: v.optional(v.string()),
	terms: v.optional(v.string()),
});

async function isUnverifiedSignup(email: string): Promise<boolean> {
	const [existing] = await db.select({ id: users.id, emailVerified: users.emailVerified })
		.from(users).where(eq(users.email, email)).limit(1);
	return Boolean(existing && !existing.emailVerified);
}

export const actions: Actions = {
	signUp: publicFormAction(
		{
			rateLimitEvent: 'signup_rate_limited',
			limits: ({ ip }) => [{ key: `signup:ip:${ip}`, max: 5 }],
			turnstile: true,
			schema: SignUpForm,
		},
		async ({ data, ipHash, event }) => {
			const email    = data.email ?? '';
			const password = data.password ?? '';
			const terms    = data.terms ?? '';

			if (!email || !password) return fail(422, { error: 'missing' });
			const policyError = passwordPolicyError(password);
			if (policyError) {
				return fail(422, { error: policyError === 'tooShort' ? 'password_too_short' : 'password_too_long' });
			}
			if (terms !== 'on') return fail(422, { error: 'terms_required' });

			const [existing] = await db.select({ id: users.id, emailVerified: users.emailVerified })
				.from(users).where(eq(users.email, email)).limit(1);

			if (existing && existing.emailVerified) {
				return { success: true, email };
			}

			const passwordHash = await bcrypt.hash(password, 12);
			const attribution = parseAttributionCookie(event.cookies.get(ATTRIBUTION_COOKIE));
			let userId: string;

			if (existing) {
				await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
				userId = existing.id;
			} else {
				const [created] = await db.insert(users).values({
					email,
					passwordHash,
					attrSource:      attribution.source,
					attrCampaign:    attribution.campaign,
					attrVariant:     attribution.variant,
					attrSegment:     attribution.segment,
					attrReferrer:    attribution.referrer,
					attrLandingPath: attribution.landingPath,
					attrReferredBy:  attribution.referredBy,
				}).returning();
				if (!created) {
					logAuthEvent('signup_failed', { ipHash });
					return fail(422, { error: 'generic' });
				}
				userId = created.id;
			}

			await recordConsent(userId, 'signup_form').catch(e =>
				console.error('[signup] consent record failed:', e)
			);
			await sendVerificationEmail(event.url, email);

			return { success: true, email };
		},
	),

	resend: resendVerificationAction({
		keyPrefix: 'signup',
		shouldSend: isUnverifiedSignup,
		result: (email, resent) => ({ success: true, email, resent }),
	}),

	signUpWithGoogle: signIn,
};
