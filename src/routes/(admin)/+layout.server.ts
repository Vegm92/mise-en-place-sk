import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: LayoutServerLoad = async ({ locals }) => {
	const adminEmails = (env.AUTH_ADMIN_EMAIL ?? '').split(',').map(s => s.trim()).filter(Boolean);
	if (!locals.user || !adminEmails.includes(locals.user.email ?? '')) {
		redirect(303, '/');
	}
	return { adminEmail: locals.user.email ?? '' };
};
