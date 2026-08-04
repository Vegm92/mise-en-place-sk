import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema/auth';
import { consumeVerificationToken } from '$lib/server/verification-token';

export const load: PageServerLoad = async ({ url, locals }) => {
	const email = url.searchParams.get('email')?.trim().toLowerCase();
	const token = url.searchParams.get('token');

	if (!email || !token || !locals.user) redirect(303, '/settings');

	const valid = await consumeVerificationToken(`change-email:${locals.user.id}:${email}`, token);
	if (!valid) redirect(303, '/settings?emailChangeFailed=1');

	await db.update(users).set({ email, emailVerified: new Date() }).where(eq(users.id, locals.user.id));

	redirect(303, '/settings?emailChanged=1');
};
