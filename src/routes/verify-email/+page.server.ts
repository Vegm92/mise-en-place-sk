import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema/auth';
import { consumeVerificationToken } from '$lib/server/verification-token';
import { issueSessionCookie } from '$lib/server/auth-session';

export const load: PageServerLoad = async ({ url, cookies }) => {
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

	await issueSessionCookie(cookies, url.protocol === 'https:', {
		id: user.id, email: user.email, name: user.name, image: user.image,
	});

	redirect(303, '/onboarding');
};
