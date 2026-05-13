import { auth } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Handle the login form POST so BetterAuth can set its signed session cookie
// directly — bypasses the form action pattern which can't forward Set-Cookie.
export const POST: RequestHandler = async ({ request }) => {
	const formData  = await request.formData();
	const email     = String(formData.get('email')      ?? '');
	const password  = String(formData.get('password')   ?? '');
	const redirectTo = String(formData.get('redirectTo') ?? '/');

	if (!email || !password) {
		return new Response(null, {
			status:  303,
			headers: { Location: `/login?error=missing&redirectTo=${encodeURIComponent(redirectTo)}` },
		});
	}

	const headers = new Headers();
	headers.set('origin', request.headers.get('origin') ?? env.BETTER_AUTH_URL ?? 'http://localhost:5173');

	const authResponse = await auth.api.signInEmail({
		body:        { email, password },
		headers,
		asResponse:  true,
	});

	if (!authResponse.ok) {
		return new Response(null, {
			status:  303,
			headers: { Location: `/login?error=invalid&redirectTo=${encodeURIComponent(redirectTo)}` },
		});
	}

	// Forward BetterAuth's Set-Cookie header (signed session token) then redirect.
	const setCookie = authResponse.headers.get('set-cookie');
	const responseHeaders = new Headers({ Location: redirectTo });
	if (setCookie) responseHeaders.set('set-cookie', setCookie);

	return new Response(null, { status: 303, headers: responseHeaders });
};
