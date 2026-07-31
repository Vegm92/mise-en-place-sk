import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { logAuthEvent, hashIp } from '$lib/server/auth-events';

const MIN_PASSWORD_LENGTH = 8;

export const load: PageServerLoad = async ({ locals }) => {
	return { hasRecoverySession: !!locals.user };
};

export const actions: Actions = {
	default: async ({ request, locals, getClientAddress }) => {
		if (!locals.user) return fail(401, { error: 'expired' });

		const form = await request.formData();
		const password = form.get('password') as string;
		const confirm = form.get('confirm') as string;

		if (!password || password.length < MIN_PASSWORD_LENGTH) return fail(422, { error: 'tooShort' });
		if (password !== confirm) return fail(422, { error: 'mismatch' });

		const { error } = await locals.supabase.auth.updateUser({ password });
		if (error) {
			console.error('[reset-password] updateUser failed:', error.message);
			return fail(400, { error: 'failed' });
		}

		logAuthEvent('password_reset_completed', { ipHash: hashIp(getClientAddress()) });
		await locals.supabase.auth.signOut();

		redirect(303, '/login?reset=1');
	},
};
