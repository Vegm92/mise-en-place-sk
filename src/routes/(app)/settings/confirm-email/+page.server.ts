import { redirect, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { consumeVerificationToken } from '$lib/server/verification-token';

export const load: PageServerLoad = async ({ url, locals }) => {
	const email = url.searchParams.get('email')?.trim().toLowerCase();
	const token = url.searchParams.get('token');

	if (!email || !token || !locals.user) redirect(303, '/settings');
	return { title: 'confirmEmail.heading', email };
};

export const actions: Actions = {
	default: async ({ url, locals }) => {
		const email = url.searchParams.get('email')?.trim().toLowerCase();
		const token = url.searchParams.get('token');

		if (!email || !token || !locals.user) redirect(303, '/settings');

		const valid = await consumeVerificationToken(`change-email:${locals.user.id}:${email}`, token);
		if (!valid) redirect(303, '/settings?emailChangeFailed=1');

		const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
		if (taken) return fail(409, { error: 'set.profile.err.emailFailed' });

		await db.update(users).set({ email, emailVerified: new Date() }).where(eq(users.id, locals.user.id));

		redirect(303, '/settings?emailChanged=1');
	},
};
