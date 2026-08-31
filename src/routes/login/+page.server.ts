import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import type { Actions, PageServerLoad } from './$types';
import { publicFormAction } from '$lib/server/public-form-action';
import { logAuthEvent } from '$lib/server/auth-events';
import { checkLoginCredentials } from '$lib/server/auth-credentials';
import { issueSessionCookie } from '$lib/server/auth-session';
import { signIn } from '$lib/server/auth';
import { safeRedirect } from '$lib/server/safe-redirect';
import { safe } from '$lib/server/load-guard';
import { countWaitlistEmails } from '$lib/server/waitlist-db';
import { BETA_SEATS } from '$lib/constants';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { sendVerificationEmail } from '$lib/server/verification-email';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));

	const seatsTaken = await safe<number | null>('login/seats', countWaitlistEmails, null);

	return {
		redirectTo: safeRedirect(url.searchParams.get('redirectTo')),
		seatsTaken,
		seatsTotal: BETA_SEATS,
	};
};

const RawEmailField = v.optional(v.pipe(v.string(), v.trim()));

function emailOf(form: FormData): string {
	const parsed = v.safeParse(RawEmailField, form.get('email') ?? undefined);
	return (parsed.success ? parsed.output : undefined) ?? '';
}

const SignInForm = v.object({
	password: v.optional(v.string()),
	redirectTo: v.optional(v.string()),
});

const ResendForm = v.object({
	email: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())),
});

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
			schema: SignInForm,
		},
		async ({ data, form, ipHash, event }) => {
			const email = emailOf(form);
			const password = data.password ?? '';
			const redirectTo = safeRedirect(data.redirectTo);

			if (!email || !password) return fail(422, { error: 'missing', email });

			const result = await checkLoginCredentials(email, password);

			if (result.status === 'invalid') {
				logAuthEvent('login_failed', { ipHash });
				return fail(401, { error: 'invalid', email });
			}

			if (result.status === 'unverified') {
				logAuthEvent('login_failed', { ipHash, scope: 'unverified' });
				return fail(403, { error: 'unverified', email: result.email });
			}

			await issueSessionCookie(event.cookies, event.url.protocol === 'https:', result.user);

			redirect(303, redirectTo);
		},
	),

	resend: publicFormAction({ schema: ResendForm }, async ({ data, ip, event }) => {
		const email = data.email ?? '';
		if (!email) return fail(422, { error: 'missing' });

		if (!(await checkRateLimit(`login:resend:${ip}`, 3))) {
			return { email, resent: false };
		}

		await sendVerificationEmail(event.url, email);
		return { email, resent: true };
	}),

	signInWithGoogle: signIn,
};
