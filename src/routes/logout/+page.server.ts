import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	redirect(303, '/waitlist');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		cookies.delete('authjs.session-token', { path: '/' });
		cookies.delete('__Secure-authjs.session-token', { path: '/' });
		redirect(303, '/waitlist');
	},
};
