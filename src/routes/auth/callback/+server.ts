import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordConsent } from '$lib/server/consent';

/** Handles Supabase OAuth callback — exchanges code for session cookies. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code  = url.searchParams.get('code');
	const rawNext = url.searchParams.get('next') ?? '/';
	// Only allow relative paths to prevent open-redirect attacks
	const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
	const error = url.searchParams.get('error');

	if (error) {
		redirect(303, `/login?error=oauth`);
	}

	if (code) {
		const { data, error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!exchangeError) {
			// consent=1 → the signup page validated the T&C checkbox before
			// starting the OAuth flow; persist it now that the user id exists.
			if (url.searchParams.get('consent') === '1' && data.user?.id) {
				await recordConsent(data.user.id, 'oauth_signup').catch(e =>
					console.error('[auth/callback] consent record failed:', e)
				);
			}
			redirect(303, next);
		}
	}

	redirect(303, '/login?error=oauth');
};
