import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import * as v from 'valibot';
import type { Actions, PageServerLoad } from './$types';
import { logAuthEvent } from '$lib/server/auth-events';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { consumeVerificationToken } from '$lib/server/verification-token';
import { passwordPolicyError } from '$lib/server/password-policy';
import { publicFormAction, rawFormField } from '$lib/server/public-form-action';

export const load: PageServerLoad = async ({ url }) => {
	const email = url.searchParams.get('email')?.trim().toLowerCase() ?? '';
	const token = url.searchParams.get('token') ?? '';
	return { email, token, hasToken: Boolean(email && token) };
};

const ResetPasswordForm = v.object({
	email: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
	token: v.optional(v.string()),
	password: v.optional(v.string()),
	confirm: v.optional(v.string()),
});

export const actions: Actions = {
	default: publicFormAction(
		{
			rateLimitEvent: 'password_reset_rate_limited',
			limits: ({ form, ip }) => {
				const email = rawFormField(form, 'email', { lowercase: true });
				const rules = [{ key: `reset:ip:${ip}`, max: 5, scope: 'ip' }];
				if (email) rules.push({ key: `reset:email:${email}`, max: 5, scope: 'email' });
				return rules;
			},
			schema: ResetPasswordForm,
		},
		async ({ data, event, ipHash }) => {
			const email    = data.email ?? '';
			const token    = data.token ?? '';
			const password = data.password ?? '';
			const confirm  = data.confirm ?? '';

			if (!email || !token) return fail(400, { error: 'expired' });
			const policyError = passwordPolicyError(password);
			if (policyError) return fail(422, { error: policyError });
			if (password !== confirm) return fail(422, { error: 'mismatch' });

			const valid = await consumeVerificationToken(`reset-password:${email}`, token);
			if (!valid) return fail(400, { error: 'expired' });

			const passwordHash = await bcrypt.hash(password, 12);
			const [user] = await db.update(users)
				.set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` })
				.where(eq(users.email, email))
				.returning();
			if (!user) return fail(400, { error: 'failed' });

			logAuthEvent('password_reset_completed', { ipHash });

			event.cookies.delete('authjs.session-token', { path: '/' });
			event.cookies.delete('__Secure-authjs.session-token', { path: '/' });

			redirect(303, '/login?reset=1');
		},
	),
};
