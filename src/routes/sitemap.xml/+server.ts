import type { RequestHandler } from '@sveltejs/kit';
import { landingVariantSlugs } from '$lib/landing-variants';
import { siteOrigin } from '$lib/server/site-origin';

const LANDING_LASTMOD = '2026-08-29';

const PUBLIC_ROUTES = [
	{ path: '/waitlist', priority: '1.0', changefreq: 'monthly', lastmod: LANDING_LASTMOD },
	{ path: '/signup',   priority: '0.6', changefreq: 'yearly',  lastmod: '2026-08-28'    },
	{ path: '/privacy',  priority: '0.3', changefreq: 'yearly',  lastmod: '2026-08-28'    },
	{ path: '/terms',    priority: '0.3', changefreq: 'yearly',  lastmod: '2026-08-27'    },
	{ path: '/cookies',  priority: '0.3', changefreq: 'yearly',  lastmod: '2026-09-06'    },
	{ path: '/refunds',  priority: '0.3', changefreq: 'yearly',  lastmod: '2026-09-06'    },
	{ path: '/legal',    priority: '0.3', changefreq: 'yearly',  lastmod: '2026-09-06'    },
	{ path: '/login',    priority: '0.4', changefreq: 'yearly',  lastmod: '2026-08-28'    },
];

const VARIANT_ROUTES = landingVariantSlugs().map((slug) => ({
	path: `/l/${slug}`,
	priority: '0.8',
	changefreq: 'monthly',
	lastmod: LANDING_LASTMOD,
}));

export const GET: RequestHandler = ({ url }) => {
	const origin = siteOrigin(url);

	const urls = [...PUBLIC_ROUTES, ...VARIANT_ROUTES].map(
		({ path, priority, changefreq, lastmod }) => `
  <url>
    <loc>${origin}${path}</loc>
    <lastmod>${lastmod}</lastmod>
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
