import { encode } from '@auth/core/jwt';
import type { Cookies } from '@sveltejs/kit';
import { config } from './env';
import { SESSION_MAX_AGE_SECONDS } from './auth';

type SessionUser = { id: string; email: string; name: string | null; image: string | null };

export async function issueSessionCookie(cookies: Cookies, isHttps: boolean, user: SessionUser): Promise<void> {
	const cookieName = `${isHttps ? '__Secure-' : ''}authjs.session-token`;

	const token = await encode({
		secret: config.auth.secret,
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
