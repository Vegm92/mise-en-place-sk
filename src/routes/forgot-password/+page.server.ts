/**
 * "Forgot password" request page (issue #284).
 *
 * Sends a Supabase recovery link that lands on /auth/callback (which exchanges
 * the code for a session) and continues to /reset-password.
 *
 * The response is identical whether or not the address has an account — a
 * different message here would turn this form into an account-enumeration
 * oracle. Rate limited per IP and per email like the login action.
 */
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';

export const load: PageServerLoad = async () => ({});

export const actions: Actions = {
	default: async ({ request, locals, url, getClientAddress }) => {
		const form = await request.formData();
		const email = (form.get('email') as string)?.trim();

		if (!email) return fail(422, { error: 'missing', email: '' });

		const ipHash = hashIp(getClientAddress());
		const ipOk = await checkRateLimit(`recover:ip:${getClientAddress()}`, 5);
		const emailOk = await checkRateLimit(`recover:email:${email.toLowerCase()}`, 3);
		if (!ipOk || !emailOk) {
			logAuthEvent('password_reset_rate_limited', { ipHash, scope: !ipOk ? 'ip' : 'email' });
			return fail(429, { error: 'rate_limited', email });
		}

		const { error } = await locals.supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/auth/callback?next=/reset-password`,
		});

		// Supabase returns an error for malformed addresses and for its own rate
		// limiter, but never "no such user". Log it and still answer "sent".
		if (error) {
			console.error('[forgot-password] resetPasswordForEmail failed:', error.message);
		}
		logAuthEvent('password_reset_requested', { ipHash });

		return { sent: true };
	},
};
