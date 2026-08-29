import type { RequestHandler } from '@sveltejs/kit';
import { siteOrigin } from '$lib/server/site-origin';

const DISALLOW = [
	'/s/',
	'/dashboard',
	'/invoices',
	'/invoice/',
	'/suppliers',
	'/products',
	'/analytics',
	'/budgets',
	'/reminders',
	'/digest',
	'/reports',
	'/settings',
	'/chat',
	'/batch',
	'/confirm',
	'/extract',
	'/help',
	'/pending',
	'/logout',
	'/plantilla-lista',
	'/verify-email',
	'/forgot-password',
	'/reset-password',
	'/api/',
	'/onboarding',
	'/billing',
	'/auth/',
	'/admin/',
];

const STANCE = [
	'# Every crawler, AI engines included, is welcome on the public pages and',
	'# blocked from the authenticated app. That stance is deliberate: we are',
	'# pre-launch with no proprietary corpus, so being read is how the brand',
	'# becomes a known entity to a generative engine.',
	'#',
	'# It is expressed in ONE User-agent: * group on purpose. A crawler obeys',
	'# only the most specific group that matches it and ignores User-agent: *',
	'# entirely once it has its own. Adding "User-agent: GPTBot / Allow: /"',
	'# below would therefore hand GPTBot the whole app surface — every Disallow',
	'# here would stop applying to it. Add per-agent groups only by repeating',
	'# the full DISALLOW list into each one.',
	'#',
	'# Google-Extended and Applebot-Extended are training/grounding opt-outs',
	'# only. Neither governs AI Overviews or Siri surfacing, which come through',
	'# ordinary Googlebot and Applebot. Disallowing them would cost us Gemini',
	'# grounding and buy nothing back for search.',
];

export const GET: RequestHandler = ({ url }) => {
	const body = [
		...STANCE,
		'',
		'User-agent: *',
		'Allow: /l/',
		...DISALLOW.map((path) => `Disallow: ${path}`),
		'',
		`Sitemap: ${siteOrigin(url)}/sitemap.xml`,
	].join('\n');

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain',
			'Cache-Control': 'public, max-age=86400',
		},
	});
};
