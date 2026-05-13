import { auth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, url.searchParams.get('redirectTo') ?? '/');
	return { redirectTo: url.searchParams.get('redirectTo') ?? '/' };
};
