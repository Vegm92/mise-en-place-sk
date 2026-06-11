import type { RequestHandler } from '@sveltejs/kit';

const PUBLIC_ROUTES = [
	{ path: '/waitlist', priority: '1.0', changefreq: 'monthly' },
	{ path: '/privacy',  priority: '0.3', changefreq: 'yearly'  },
	{ path: '/terms',    priority: '0.3', changefreq: 'yearly'  },
	{ path: '/login',    priority: '0.4', changefreq: 'yearly'  },
];

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	const now = new Date().toISOString().split('T')[0];

	const urls = PUBLIC_ROUTES.map(
		({ path, priority, changefreq }) => `
  <url>
    <loc>${origin}${path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
	).join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=86400',
		},
	});
};
