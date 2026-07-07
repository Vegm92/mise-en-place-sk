import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = ({ url }) => {
	// (app) is a SvelteKit route group and never appears in real URLs, so the
	// authenticated pages must be listed by their served paths.
	const body = [
		'User-agent: *',
		'Disallow: /dashboard',
		'Disallow: /invoices',
		'Disallow: /invoice/',
		'Disallow: /suppliers',
		'Disallow: /analytics',
		'Disallow: /budgets',
		'Disallow: /reminders',
		'Disallow: /digest',
		'Disallow: /settings',
		'Disallow: /chat',
		'Disallow: /batch',
		'Disallow: /confirm',
		'Disallow: /extract',
		'Disallow: /save-confirmation',
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
