import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema/auth';
import { consumeVerificationToken } from '$lib/server/verification-token';

export const load: PageServerLoad = async ({ url }) => {
	const email = url.searchParams.get('email')?.trim().toLowerCase();
	const token = url.searchParams.get('token');

	if (!email || !token) return { ok: false };
	return { ok: true, email, token };
};

export const actions: Actions = {
	default: async ({ url }) => {
		const email = url.searchParams.get('email')?.trim().toLowerCase();
		const token = url.searchParams.get('token');

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
};
