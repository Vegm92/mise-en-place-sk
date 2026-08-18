import adapter from '@sveltejs/adapter-node';
import 'dotenv/config';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		csp: {
			mode: 'hash',
			directives: {
				'default-src':  ['self'],
				'script-src':   ['self'],
				'style-src':    ['self', 'unsafe-inline'],
				'font-src':     ['self'],
				'img-src':      ['self', 'data:'],
				'connect-src':  ['self', 'https://*.sentry.io'],
				// 'blob:' — Sentry's replayIntegration compresses events in a worker
				// it spawns from a blob URL; without it Replay silently degrades.
				'worker-src':   ['self', 'blob:'],
				// 'self' — the invoice PDF viewer embeds /api/upload/[id]/[file]
				// in a same-origin iframe; still blocks third-party framing.
				'frame-src':    ['self'],
				'object-src':   ['none'],
				'base-uri':     ['self'],
				// 'https://accounts.google.com' — the signInWithGoogle form action
				// redirects (303) to Google's OAuth consent screen; form-action
				// governs that redirect target, not just the initial same-origin URL.
				// 'https://checkout.stripe.com' — the billing checkout form action
				// redirects (303) there the same way; without it Chrome silently
				// blocks the redirect and the buy button appears to do nothing.
				'form-action':  ['self', 'https://accounts.google.com', 'https://checkout.stripe.com'],
			},
		},
	}
};

export default config;
