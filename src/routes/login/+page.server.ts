import { auth } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, url.searchParams.get('redirectTo') ?? '/');
	return { redirectTo: url.searchParams.get('redirectTo') ?? '/' };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data       = await request.formData();
		const email      = String(data.get('email')      ?? '');
		const password   = String(data.get('password')   ?? '');
		const redirectTo = String(data.get('redirectTo') ?? '/');

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required.', email });
		}

		let result: Awaited<ReturnType<typeof auth.api.signInEmail>>;
		try {
			result = await auth.api.signInEmail({ body: { email, password } });
		} catch {
			return fail(401, { error: 'Invalid email or password.', email });
		}

		if (!result?.token) {
			return fail(401, { error: 'Invalid email or password.', email });
		}

		cookies.set('better-auth.session_token', result.token, {
			path:     '/',
			httpOnly: true,
			sameSite: 'lax',
			secure:   process.env.NODE_ENV === 'production',
			maxAge:   60 * 60 * 24 * 7,
		});

		redirect(303, redirectTo);
	},
};
