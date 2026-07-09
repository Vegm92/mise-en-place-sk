import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { safeRedirect } from '$lib/server/safe-redirect';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';

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

		// Failures return fail() instead of redirecting so the form keeps the
		// typed email — retyping it after a password slip is pure friction.
		if (!email || !password) return fail(422, { error: 'missing', email: email ?? '' });

		// Brute-force protection: per-IP and per-account attempt caps.
		const ipHash  = hashIp(getClientAddress());
		const ipOk    = await checkRateLimit(`login:ip:${getClientAddress()}`, 10);
		const emailOk = await checkRateLimit(`login:email:${email.toLowerCase()}`, 5);
		if (!ipOk || !emailOk) {
			logAuthEvent('login_rate_limited', { ipHash, scope: !ipOk ? 'ip' : 'email' });
			return fail(429, { error: 'rate_limited', email });
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) {
			logAuthEvent('login_failed', { ipHash });
			return fail(401, { error: 'invalid', email });
		}

		redirect(303, redirectTo);
	},

	signInWithGoogle: async ({ url, locals, getClientAddress }) => {
		const { data, error } = await locals.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/callback` },
		});
		if (error || !data.url) {
			logAuthEvent('oauth_error', { ipHash: hashIp(getClientAddress()), stage: 'login_start' });
			redirect(303, '/login?error=oauth');
		}
		redirect(303, data.url);
	},
};
