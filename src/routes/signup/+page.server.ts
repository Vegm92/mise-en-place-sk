import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, locals.restaurantId ? '/' : '/onboarding');
	return {};
};

export const actions: Actions = {
	signUp: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email    = (form.get('email')    as string)?.trim();
		const password = form.get('password')  as string;
		const terms    = form.get('terms');

		if (!email || !password) return fail(422, { error: 'missing' });
		if (password.length < 8) return fail(422, { error: 'password_too_short' });
		// Explicit, recorded consent to Terms + Privacy Policy (GDPR).
		if (terms !== 'on') return fail(422, { error: 'terms_required' });

		const { error } = await locals.supabase.auth.signUp({
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
			return fail(422, { error: 'generic' });
		}

		// Welcome email is sent once, after onboarding completes (covers both
		// email and Google sign-ups and fires when the account is actually active).
		return { success: true };
	},

	signUpWithGoogle: async ({ url, locals }) => {
		const { data, error } = await locals.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/callback?next=/onboarding` },
		});
		if (error || !data.url) redirect(303, '/signup?error=oauth');
		redirect(303, data.url);
	},
};
