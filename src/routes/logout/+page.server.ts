import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies }) => {
		cookies.delete('authjs.session-token', { path: '/' });
		cookies.delete('__Secure-authjs.session-token', { path: '/' });
		redirect(303, '/login');
	},
};
