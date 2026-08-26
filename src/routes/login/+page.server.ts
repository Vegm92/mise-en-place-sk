import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { publicFormAction } from '$lib/server/public-form-action';
import { logAuthEvent } from '$lib/server/auth-events';
import { verifyCredentials } from '$lib/server/auth-credentials';
import { issueSessionCookie } from '$lib/server/auth-session';
import { signIn } from '$lib/server/auth';
import { safeRedirect } from '$lib/server/safe-redirect';
import { safe } from '$lib/server/load-guard';
import { countWaitlistEmails } from '$lib/server/waitlist-db';
import { BETA_SEATS } from '$lib/constants';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));

	const seatsTaken = await safe<number | null>('login/seats', countWaitlistEmails, null);

	return {
		redirectTo: safeRedirect(url.searchParams.get('redirectTo')),
		seatsTaken,
		seatsTotal: BETA_SEATS,
	};
};

function emailOf(form: FormData) {
	return (form.get('email') as string)?.trim() ?? '';
}

export const actions: Actions = {
	signIn: publicFormAction(
		{
			rateLimitEvent: 'login_rate_limited',
			failData: ({ form }) => ({ email: emailOf(form) }),
			limits: ({ form, ip }) => {
				const email = emailOf(form);
				const rules = [{ key: `login:ip:${ip}`, max: 10, scope: 'ip' }];
				if (email) rules.push({ key: `login:email:${email.toLowerCase()}`, max: 5, scope: 'email' });
				return rules;
			},
		},
		async ({ form, ipHash, event }) => {
			const email = emailOf(form);
			const password = form.get('password') as string;
			const redirectTo = safeRedirect(form.get('redirectTo') as string);

			if (!email || !password) return fail(422, { error: 'missing', email });

			const verified = await verifyCredentials(email, password);
			if (!verified) {
				logAuthEvent('login_failed', { ipHash });
				return fail(401, { error: 'invalid', email });
			}

			await issueSessionCookie(event.cookies, event.url.protocol === 'https:', verified);

			redirect(303, redirectTo);
		},
	),

	signInWithGoogle: signIn,
};
