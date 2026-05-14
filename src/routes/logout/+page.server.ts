import { auth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		await auth.api.signOut({ headers: request.headers });
		cookies.delete('better-auth.session_token', { path: '/' });
		redirect(303, '/login');
	},
};
