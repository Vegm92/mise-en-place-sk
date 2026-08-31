import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import type { Actions, PageServerLoad } from './$types';
import { publicFormAction, rawFormField } from '$lib/server/public-form-action';
import { logAuthEvent } from '$lib/server/auth-events';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { createVerificationToken } from '$lib/server/verification-token';
import { sendEmail, resetPasswordEmail } from '$lib/server/email';

export const load: PageServerLoad = async () => ({});

function emailOf(form: FormData): string {
	return rawFormField(form, 'email', { lowercase: true });
}

const ForgotPasswordForm = v.object({
	email: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
});

export const actions: Actions = {
	default: publicFormAction(
		{
			rateLimitEvent: 'password_reset_rate_limited',
			failData: ({ form }) => ({ email: emailOf(form) }),
			limits: ({ form, ip }) => {
				const email = emailOf(form);
				const rules = [{ key: `recover:ip:${ip}`, max: 5, scope: 'ip' }];
				if (email) rules.push({ key: `recover:email:${email}`, max: 3, scope: 'email' });
				return rules;
			},
			schema: ForgotPasswordForm,
		},
		async ({ data, ipHash, event }) => {
			const email = data.email ?? '';
			if (!email) return fail(422, { error: 'missing', email: '' });

			const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
			if (user) {
				const token = await createVerificationToken(`reset-password:${email}`);
				const resetUrl = `${event.url.origin}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
				await sendEmail(resetPasswordEmail(email, resetUrl));
			}
			logAuthEvent('password_reset_requested', { ipHash });

			return { sent: true };
		},
	),
};
