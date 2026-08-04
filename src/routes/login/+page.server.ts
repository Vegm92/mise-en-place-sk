import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { safeRedirect } from '$lib/server/safe-redirect';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';
import { verifyCredentials } from '$lib/server/auth-credentials';
import { issueSessionCookie } from '$lib/server/auth-session';
import { signIn } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	return { redirectTo: safeRedirect(url.searchParams.get('redirectTo')) };
};

export const actions: Actions = {
	signIn: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const email    = (form.get('email')    as string)?.trim();
		const password = form.get('password')  as string;
		const redirectTo = safeRedirect(form.get('redirectTo') as string);

		if (!email || !password) return fail(422, { error: 'missing', email: email ?? '' });

		const ipHash  = hashIp(getClientAddress());
		const ipOk    = await checkRateLimit(`login:ip:${getClientAddress()}`, 10);
		const emailOk = await checkRateLimit(`login:email:${email.toLowerCase()}`, 5);
		if (!ipOk || !emailOk) {
			logAuthEvent('login_rate_limited', { ipHash, scope: !ipOk ? 'ip' : 'email' });
			return fail(429, { error: 'rate_limited', email });
		}

		const verified = await verifyCredentials(email, password);
		if (!verified) {
			logAuthEvent('login_failed', { ipHash });
			return fail(401, { error: 'invalid', email });
		}

		await issueSessionCookie(cookies, url.protocol === 'https:', verified);

		redirect(303, redirectTo);
	},

	signInWithGoogle: signIn,
};
