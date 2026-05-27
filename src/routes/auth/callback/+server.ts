import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
		const { error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!exchangeError) redirect(303, next);
	}

	redirect(303, '/login?error=oauth');
};
