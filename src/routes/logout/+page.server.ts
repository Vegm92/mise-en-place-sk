import { redirect, type Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function purgeAuthCookies(cookies: Cookies) {
	for (const cookie of cookies.getAll()) {
		if (cookie.name.includes('authjs')) {
			cookies.delete(cookie.name, { path: '/' });
		}
	}
}

export const load: PageServerLoad = async ({ cookies }) => {
	purgeAuthCookies(cookies);
	redirect(303, '/waitlist');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		purgeAuthCookies(cookies);
		redirect(303, '/waitlist');
	},
};
