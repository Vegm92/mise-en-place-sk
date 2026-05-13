import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}
	return {
		user: {
			id:    locals.user.id,
			name:  locals.user.name,
			email: locals.user.email,
		},
	};
};
