import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = ({ url }) => {
	const body = [
		'User-agent: *',
		'Disallow: /(app)/',
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
