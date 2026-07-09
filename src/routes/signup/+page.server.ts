import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordConsent } from '$lib/server/consent';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, locals.restaurantId ? '/' : '/onboarding');
	return {};
};

export const actions: Actions = {
	signUp: async ({ request, locals, url, getClientAddress }) => {
		const form = await request.formData();
		const email    = (form.get('email')    as string)?.trim();
		const password = form.get('password')  as string;
		const terms    = form.get('terms');

		if (!email || !password) return fail(422, { error: 'missing' });

		// Cap account-creation attempts per IP (abuse / user-enumeration control).
		if (!(await checkRateLimit(`signup:ip:${getClientAddress()}`, 5))) {
			logAuthEvent('signup_rate_limited', { ipHash: hashIp(getClientAddress()) });
			return fail(429, { error: 'rate_limited' });
		}
		if (password.length < 8) return fail(422, { error: 'password_too_short' });
		// Explicit, recorded consent to Terms + Privacy Policy (GDPR).
		if (terms !== 'on') return fail(422, { error: 'terms_required' });

		const { data, error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: {
				emailRedirectTo: `${url.origin}/auth/callback?next=/onboarding`,
			},
		});

		if (error) {
			if (error.message.toLowerCase().includes('already registered')) {
				return fail(422, { error: 'already_registered' });
			}
			// A broken Supabase auth config shows up here as a generic failure —
			// surface it so it's distinguishable from "no one is signing up".
			logAuthEvent('signup_failed', { ipHash: hashIp(getClientAddress()) });
			return fail(422, { error: 'generic' });
		}

		// Persist the checkbox acceptance (timestamp + policy version) for audit.
		if (data.user?.id) {
			await recordConsent(data.user.id, 'signup_form').catch(e =>
				console.error('[signup] consent record failed:', e)
			);
		}

		// Welcome email is sent once, after onboarding completes (covers both
		// email and Google sign-ups and fires when the account is actually active).
		return { success: true, email };
	},

	// Re-send the verification link from the "check your email" screen, so a
	// lost or delayed email doesn't strand the user outside the app.
	resend: async ({ request, locals, url, getClientAddress }) => {
		const form = await request.formData();
		const email = (form.get('email') as string)?.trim();
		if (!email) return fail(422, { error: 'missing' });

		// Success-shaped returns keep the "check your email" screen on screen;
		// `resent` distinguishes a real send from a rate-limited attempt.
		if (!(await checkRateLimit(`signup:resend:${getClientAddress()}`, 3))) {
			return { success: true, email, resent: false };
		}

		await locals.supabase.auth.resend({
			type: 'signup',
			email,
			options: { emailRedirectTo: `${url.origin}/auth/callback?next=/onboarding` },
		});
		return { success: true, email, resent: true };
	},

	signUpWithGoogle: async ({ request, url, locals, getClientAddress }) => {
		// OAuth sign-ups must accept the Terms too; the callback records the
		// consent once the Supabase user exists (consent=1 flag).
		const form = await request.formData();
		if (form.get('terms') !== 'on') return fail(422, { error: 'terms_required' });

		const { data, error } = await locals.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/callback?next=/onboarding&consent=1` },
		});
		if (error || !data.url) {
			logAuthEvent('oauth_error', { ipHash: hashIp(getClientAddress()), stage: 'signup_start' });
			redirect(303, '/signup?error=oauth');
		}
		redirect(303, data.url);
	},
};
