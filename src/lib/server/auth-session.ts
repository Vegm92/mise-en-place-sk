import { encode } from '@auth/core/jwt';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { SESSION_MAX_AGE_SECONDS } from './auth';

type SessionUser = { id: string; email: string; name: string | null; image: string | null };

/**
 * Mints an Auth.js-compatible session cookie directly via @auth/core/jwt's
 * encode(), the same primitive Auth.js's own callback flow uses internally
 * (see @auth/core/lib/actions/callback: `salt = cookies.sessionToken.name`).
 * Used for login/signup flows with custom rate-limiting that can't go
 * through Auth.js's form-action-shaped signIn() without losing that.
 */
export async function issueSessionCookie(cookies: Cookies, isHttps: boolean, user: SessionUser): Promise<void> {
	const cookieName = `${isHttps ? '__Secure-' : ''}authjs.session-token`;

	const token = await encode({
		secret: env.AUTH_SECRET!,
		salt:   cookieName,
		maxAge: SESSION_MAX_AGE_SECONDS,
		token:  { sub: user.id, email: user.email, name: user.name, picture: user.image },
	});

	cookies.set(cookieName, token, {
		httpOnly: true,
		sameSite: 'lax',
		path:     '/',
		secure:   isHttps,
		maxAge:   SESSION_MAX_AGE_SECONDS,
	});
}
