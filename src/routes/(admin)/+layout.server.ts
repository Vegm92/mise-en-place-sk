import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isAdminUser } from '$lib/server/admin';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!isAdminUser(locals.user)) {
		redirect(303, locals.user ? '/' : '/login?redirectTo=%2Fadmin');
	}
	return { adminEmail: locals.user?.email ?? '' };
};
