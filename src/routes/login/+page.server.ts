import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { safeRedirect } from '$lib/server/safe-redirect';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	return { redirectTo: safeRedirect(url.searchParams.get('redirectTo')) };
};

export const actions: Actions = {
	signIn: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const email    = (form.get('email')    as string)?.trim();
		const password = form.get('password')  as string;
		const redirectTo = safeRedirect(form.get('redirectTo') as string);

		if (!email || !password) redirect(303, '/login?error=missing');

		// Brute-force protection: per-IP and per-account attempt caps.
		const ipOk    = await checkRateLimit(`login:ip:${getClientAddress()}`, 10);
		const emailOk = await checkRateLimit(`login:email:${email.toLowerCase()}`, 5);
		if (!ipOk || !emailOk) redirect(303, '/login?error=rate_limited');

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) redirect(303, '/login?error=invalid');

		redirect(303, redirectTo);
	},

	signInWithGoogle: async ({ url, locals }) => {
		const { data, error } = await locals.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/callback` },
		});
		if (error || !data.url) redirect(303, '/login?error=oauth');
		redirect(303, data.url);
	},
};
