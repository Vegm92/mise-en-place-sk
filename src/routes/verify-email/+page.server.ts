import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { consumeVerificationToken } from '$lib/server/verification-token';
import { publicFormAction, rawFormField } from '$lib/server/public-form-action';

export const load: PageServerLoad = async ({ url }) => {
	const email = url.searchParams.get('email')?.trim().toLowerCase();
	const token = url.searchParams.get('token');

	if (!email || !token) return { ok: false };
	return { ok: true, email, token };
};

const VerifyEmailForm = v.object({
	email: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
	token: v.optional(v.string()),
});

export const actions: Actions = {
	default: publicFormAction(
		{
			rateLimitEvent: 'verify_email_rate_limited',
			failData: () => ({ ok: false }),
			limits: ({ form, ip, event }) => {
				const email = rawFormField(form, 'email', { lowercase: true }) || event.url.searchParams.get('email')?.trim().toLowerCase() || '';
				const rules = [{ key: `verify:ip:${ip}`, max: 10, scope: 'ip' }];
				if (email) rules.push({ key: `verify:email:${email}`, max: 5, scope: 'email' });
				return rules;
			},
			schema: VerifyEmailForm,
		},
		async ({ data, event }) => {
			const email = data.email || event.url.searchParams.get('email')?.trim().toLowerCase();
			const token = data.token || event.url.searchParams.get('token');

			if (!email || !token) return { ok: false };

			const valid = await consumeVerificationToken(`verify-email:${email}`, token);
			if (!valid) return { ok: false };

			const [user] = await db
				.update(users)
				.set({ emailVerified: new Date() })
				.where(eq(users.email, email))
				.returning();

			if (!user) return { ok: false };

			redirect(303, '/login?verified=1');
		},
	),
};
