import { redirect, fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { recordConsent } from '$lib/server/consent';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema/auth';
import { createVerificationToken } from '$lib/server/verification-token';
import { sendEmail, verifyEmailAddress } from '$lib/server/email';

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
	signUp: async ({ request, url, getClientAddress }) => {
		const form = await request.formData();
		const email    = (form.get('email')    as string)?.trim().toLowerCase();
		const password = form.get('password')  as string;
		const terms    = form.get('terms');

		if (!email || !password) return fail(422, { error: 'missing' });

		if (!(await checkRateLimit(`signup:ip:${getClientAddress()}`, 5))) {
			logAuthEvent('signup_rate_limited', { ipHash: hashIp(getClientAddress()) });
			return fail(429, { error: 'rate_limited' });
		}
		if (password.length < 8) return fail(422, { error: 'password_too_short' });
		if (terms !== 'on') return fail(422, { error: 'terms_required' });

		const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
		if (existing) return fail(422, { error: 'already_registered' });

		const passwordHash = await bcrypt.hash(password, 12);
		const [created] = await db.insert(users).values({ email, passwordHash }).returning();

		if (!created) {
			logAuthEvent('signup_failed', { ipHash: hashIp(getClientAddress()) });
			return fail(422, { error: 'generic' });
		}

		await recordConsent(created.id, 'signup_form').catch(e =>
			console.error('[signup] consent record failed:', e)
		);
		await sendVerificationEmail(url, email);

		return { success: true, email };
	},

	resend: async ({ request, url, getClientAddress }) => {
		const form = await request.formData();
		const email = (form.get('email') as string)?.trim().toLowerCase();
		if (!email) return fail(422, { error: 'missing' });

		if (!(await checkRateLimit(`signup:resend:${getClientAddress()}`, 3))) {
			return { success: true, email, resent: false };
		}

		await sendVerificationEmail(url, email);
		return { success: true, email, resent: true };
	},
};
