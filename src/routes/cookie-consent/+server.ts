import { redirect } from '@sveltejs/kit';
import { writeConsent } from '$lib/server/cookie-consent';
import type { RequestHandler } from './$types';

function safeNext(raw: FormDataEntryValue | null): string {
	if (typeof raw !== 'string') return '/';
	if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
	return raw;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const form = await request.formData();
	const choice = form.get('choice') === 'granted' ? 'granted' : 'denied';

	writeConsent(cookies, choice);

	redirect(303, safeNext(form.get('next')));
};
