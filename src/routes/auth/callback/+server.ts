import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Handles Supabase OAuth callback — exchanges code for session cookies. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code  = url.searchParams.get('code');
	const next  = url.searchParams.get('next') ?? '/';
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
