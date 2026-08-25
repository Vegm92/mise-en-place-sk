import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Uploads source maps and creates a release on build when SENTRY_AUTH_TOKEN is
// set; a silent no-op otherwise. Registered before sveltekit() below.
// autoInstrument is off: it rewrites every +page.server.ts `load` export to
// require a full SvelteKit request event, which breaks unit tests that call
// `load()` directly with a partial mock — request-level tracing already comes
// from Sentry.sentryHandle() in hooks.server.ts.
const sentryPlugins = await sentrySvelteKit({
	autoInstrument: false,
	org: process.env['SENTRY_ORG'],
	project: process.env['SENTRY_PROJECT'],
	authToken: process.env['SENTRY_AUTH_TOKEN'],
});

export default defineConfig(({ mode }) => {
	// Vite loads .env into import.meta.env / $env only — server modules that
	// read process.env directly (env.ts, queue.ts, storage.ts) need this bridge in dev.
	const fileEnv = loadEnv(mode, process.cwd(), '');
	for (const [key, value] of Object.entries(fileEnv)) {
		process.env[key] ??= value;
	}

	return {
		plugins: [
			...sentryPlugins,
			tailwindcss(),
			sveltekit(),
			VitePWA({
				// SW updates silently in the background; new version activates on next visit.
				registerType: 'autoUpdate',
				// Null: we register manually in +layout.svelte to stay CSP-compatible.
				injectRegister: null,
				// We own the manifest (static/manifest.webmanifest); no plugin injection.
				manifest: false,
				workbox: {
					// Precache JS bundles, CSS, fonts, and icons.
					// HTML pages are SSR — skip them (no navigateFallback).
					globPatterns: ['**/*.{js,css,woff2}', 'icons/**/*.png'],
					navigateFallback: null,
					cleanupOutdatedCaches: true,
					runtimeCaching: [
						{
							// API routes: fresh data first, cached fallback within 10 s.
							urlPattern: /^\/api\//,
							handler: 'NetworkFirst',
							options: {
								cacheName: 'api-v1',
								networkTimeoutSeconds: 10,
								expiration: { maxEntries: 60, maxAgeSeconds: 5 * 60 },
								cacheableResponse: { statuses: [0, 200] },
							},
						},
						{
							// SvelteKit immutable assets carry content hashes → cache forever.
							urlPattern: /\/_app\/immutable\//,
							handler: 'CacheFirst',
							options: {
								cacheName: 'sk-immutable-v1',
								expiration: {
									maxEntries: 300,
									maxAgeSeconds: 365 * 24 * 60 * 60,
								},
								cacheableResponse: { statuses: [0, 200] },
							},
						},
						{
							// Fonts from self (woff2, etc.)
							urlPattern: /\.woff2?$/,
							handler: 'CacheFirst',
							options: {
								cacheName: 'fonts-v1',
								expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
								cacheableResponse: { statuses: [0, 200] },
							},
						},
					],
				},
			}),
		],
		server: {
			allowedHosts: true,
		},
		test: {
			include: ['tests/**/*.test.ts'],
			globalSetup: ['tests/setup/global-setup.ts'],
			// Default reporter first; the skip summary prints below its
			// "Test Files … skipped" line, where a developer actually looks.
			reporters: ['default', './tests/setup/skip-summary-reporter.ts'],
			environment: 'node',
			globals: true,
			coverage: {
				provider: 'v8',
				include: [
					'src/lib/formatters.ts',
					'src/lib/status.ts',
					'src/lib/server/extract.ts',
					'src/lib/server/products.ts',
					'src/lib/server/alert-engine.ts',
					'src/lib/server/db.ts',
					'src/lib/server/tenant.ts',
				],
				thresholds: {
					lines: 80,
				},
			},
		},
	};
});
