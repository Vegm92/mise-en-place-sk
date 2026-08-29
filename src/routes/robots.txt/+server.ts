import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = ({ url }) => {
	const body = [
		'User-agent: *',
		'Allow: /l/',
		'Disallow: /s/',
		'Disallow: /dashboard',
		'Disallow: /invoices',
		'Disallow: /invoice/',
		'Disallow: /suppliers',
		'Disallow: /analytics',
		'Disallow: /budgets',
		'Disallow: /reminders',
		'Disallow: /digest',
		'Disallow: /reports',
		'Disallow: /settings',
		'Disallow: /chat',
		'Disallow: /batch',
		'Disallow: /confirm',
		'Disallow: /extract',
		'Disallow: /forgot-password',
		'Disallow: /reset-password',
		'Disallow: /api/',
		'Disallow: /onboarding',
		'Disallow: /billing',
		'Disallow: /auth/',
		'Disallow: /admin/',
		'',
		`Sitemap: ${url.origin}/sitemap.xml`,
	].join('\n');

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain',
			'Cache-Control': 'public, max-age=86400',
		},
	});
};
