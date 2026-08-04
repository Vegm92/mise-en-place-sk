import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema/auth';
import { createVerificationToken } from '$lib/server/verification-token';
import { sendEmail, resetPasswordEmail } from '$lib/server/email';

export const load: PageServerLoad = async () => ({});

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const form = await request.formData();
		const email = (form.get('email') as string)?.trim().toLowerCase();

		if (!email) return fail(422, { error: 'missing', email: '' });

		const ipHash = hashIp(getClientAddress());
		const ipOk = await checkRateLimit(`recover:ip:${getClientAddress()}`, 5);
		const emailOk = await checkRateLimit(`recover:email:${email}`, 3);
		if (!ipOk || !emailOk) {
			logAuthEvent('password_reset_rate_limited', { ipHash, scope: !ipOk ? 'ip' : 'email' });
			return fail(429, { error: 'rate_limited', email });
		}

		// Always report success regardless of whether the email exists — do not
		// leak account existence to the caller.
		const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
		if (user) {
			const token = await createVerificationToken(`reset-password:${email}`);
			const resetUrl = `${url.origin}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
			await sendEmail(resetPasswordEmail(email, resetUrl));
		}
		logAuthEvent('password_reset_requested', { ipHash });

		return { sent: true };
	},
};
