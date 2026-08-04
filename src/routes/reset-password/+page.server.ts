import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema/auth';
import { consumeVerificationToken } from '$lib/server/verification-token';

const MIN_PASSWORD_LENGTH = 8;

export const load: PageServerLoad = async ({ url }) => {
	const email = url.searchParams.get('email')?.trim().toLowerCase() ?? '';
	const token = url.searchParams.get('token') ?? '';
	return { email, token, hasToken: Boolean(email && token) };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const email    = (form.get('email') as string)?.trim().toLowerCase();
		const token    = form.get('token') as string;
		const password = form.get('password') as string;
		const confirm  = form.get('confirm') as string;

		if (!email || !token) return fail(400, { error: 'expired' });
		if (!password || password.length < MIN_PASSWORD_LENGTH) return fail(422, { error: 'tooShort' });
		if (password !== confirm) return fail(422, { error: 'mismatch' });

		const valid = await consumeVerificationToken(`reset-password:${email}`, token);
		if (!valid) return fail(400, { error: 'expired' });

		const passwordHash = await bcrypt.hash(password, 12);
		const [user] = await db.update(users).set({ passwordHash }).where(eq(users.email, email)).returning();
		if (!user) return fail(400, { error: 'failed' });

		logAuthEvent('password_reset_completed', { ipHash: hashIp(getClientAddress()) });

		cookies.delete('authjs.session-token', { path: '/' });
		cookies.delete('__Secure-authjs.session-token', { path: '/' });

		redirect(303, '/login?reset=1');
	},
};
