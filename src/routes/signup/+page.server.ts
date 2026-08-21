import { redirect, fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { recordConsent } from '$lib/server/consent';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { publicFormAction } from '$lib/server/public-form-action';
import { logAuthEvent } from '$lib/server/auth-events';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { createVerificationToken } from '$lib/server/verification-token';
import { sendEmail, verifyEmailAddress } from '$lib/server/email';
import { signIn } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, locals.restaurantId ? '/' : '/onboarding');
	return {};
};

async function sendVerificationEmail(url: URL, email: string) {
	const token = await createVerificationToken(`verify-email:${email}`);
	const verifyUrl = `${url.origin}/verify-email?email=${encodeURIComponent(email)}&token=${token}`;
	await sendEmail(verifyEmailAddress(email, verifyUrl));
}

export const actions: Actions = {
	signUp: publicFormAction(
		{
			rateLimitEvent: 'signup_rate_limited',
			limits: ({ ip }) => [{ key: `signup:ip:${ip}`, max: 5 }],
		},
		async ({ form, ipHash, event }) => {
			const email    = (form.get('email')    as string)?.trim().toLowerCase();
			const password = form.get('password')  as string;
			const terms    = form.get('terms');

			if (!email || !password) return fail(422, { error: 'missing' });
			if (password.length < 8) return fail(422, { error: 'password_too_short' });
			if (terms !== 'on') return fail(422, { error: 'terms_required' });

			const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
			if (existing) return fail(422, { error: 'already_registered' });

			const passwordHash = await bcrypt.hash(password, 12);
			const [created] = await db.insert(users).values({ email, passwordHash }).returning();

			if (!created) {
				logAuthEvent('signup_failed', { ipHash });
				return fail(422, { error: 'generic' });
			}

			await recordConsent(created.id, 'signup_form').catch(e =>
				console.error('[signup] consent record failed:', e)
			);
			await sendVerificationEmail(event.url, email);

			return { success: true, email };
		},
	),

	resend: publicFormAction({}, async ({ form, ip, event }) => {
		const email = (form.get('email') as string)?.trim().toLowerCase();
		if (!email) return fail(422, { error: 'missing' });

		if (!(await checkRateLimit(`signup:resend:${ip}`, 3))) {
			return { success: true, email, resent: false };
		}

		await sendVerificationEmail(event.url, email);
		return { success: true, email, resent: true };
	}),

	signUpWithGoogle: signIn,
};
