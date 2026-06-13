import adapter from '@sveltejs/adapter-node';

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
				'frame-src':    ['none'],
				'object-src':   ['none'],
				'base-uri':     ['self'],
				'form-action':  ['self'],
			},
		},
	}
};

export default config;
