import { error, redirect } from '@sveltejs/kit';
import { writeConsent } from '$lib/server/cookie-consent';
import { checkRateLimit } from '$lib/server/rate-limiter';
import type { RequestHandler } from './$types';

function safeNext(raw: FormDataEntryValue | null): string {
	if (typeof raw !== 'string') return '/';
	if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
	return raw;
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const ip = getClientAddress();
	if (!(await checkRateLimit(`cookie-consent:${ip}`, 30))) {
		throw error(429, 'Too many requests');
	}

	const form = await request.formData();
	const rawChoice = form.get('choice');
	if (rawChoice !== 'granted' && rawChoice !== 'denied') {
		throw error(400, 'Invalid choice value');
	}

	writeConsent(cookies, rawChoice);

	redirect(303, safeNext(form.get('next')));
};
