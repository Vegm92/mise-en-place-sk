import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordConsent } from '$lib/server/consent';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';

export const GET: RequestHandler = async ({ url, locals, getClientAddress }) => {
	const code  = url.searchParams.get('code');
	const rawNext = url.searchParams.get('next') ?? '/';
	const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
	const error = url.searchParams.get('error');

	if (error) {
		logAuthEvent('oauth_error', { ipHash: hashIp(getClientAddress()), stage: 'callback_provider' });
		redirect(303, `/login?error=oauth`);
	}

	if (code) {
		const { data, error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!exchangeError) {
			if (url.searchParams.get('consent') === '1' && data.user?.id) {
				await recordConsent(data.user.id, 'oauth_signup').catch(e =>
					console.error('[auth/callback] consent record failed:', e)
				);
			}
			redirect(303, next);
		}
		logAuthEvent('oauth_error', { ipHash: hashIp(getClientAddress()), stage: 'code_exchange' });
	}

	redirect(303, '/login?error=oauth');
};
