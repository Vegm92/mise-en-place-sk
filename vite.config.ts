import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';

// Files that never touch the module mocker or process.env can share one
// module graph per worker (isolate: false), which is where most of the
// suite's wall time goes (collect phase). Anything that mocks stays isolated:
// vi.mock state and module singletons leak between files in a worker.
const MOCKS_OR_ENV = /vi\.(mock|doMock|stubEnv|stubGlobal|hoisted)\(|process\.env\.[A-Z_]+ *=[^=]/;
const testFiles = readdirSync('tests', { recursive: true })
	.map((f) => `tests/${String(f).replace(/\\/g, '/')}`)
	.filter((f) => f.endsWith('.test.ts'));
const isolatedTests = testFiles.filter((f) => MOCKS_OR_ENV.test(readFileSync(f, 'utf8')));
const sharedTests = testFiles.filter((f) => !isolatedTests.includes(f));

// Sentry, tailwind and the PWA plugin only matter for dev/build; under vitest
// (environment: node, no component or CSS tests) merely importing them costs
// ~1s of fixed startup per invocation, paid twice by `pnpm test`.
async function buildOnlyPlugins(): Promise<[PluginOption[], PluginOption[]]> {
	const [{ sentrySvelteKit }, { default: tailwindcss }, { VitePWA }] = await Promise.all([
		import('@sentry/sveltekit'),
		import('@tailwindcss/vite'),
		import('vite-plugin-pwa'),
	]);
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
	const pwa = VitePWA({
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
	});
	return [[...sentryPlugins, tailwindcss()], [pwa]];
}
const [prePlugins, postPlugins] = process.env['VITEST'] ? [[], []] : await buildOnlyPlugins();

export default defineConfig(({ mode }) => {
	// Vite loads .env into import.meta.env / $env only — server modules that
	// read process.env directly (env.ts, queue.ts, storage.ts) need this bridge in dev.
	const fileEnv = loadEnv(mode, process.cwd(), '');
	for (const [key, value] of Object.entries(fileEnv)) {
		process.env[key] ??= value;
	}

	return {
		plugins: [...prePlugins, sveltekit(), ...postPlugins],
		build: {
			rollupOptions: {
				external: ['@whiskeysockets/baileys', 'qrcode-terminal'],
			},
		},
		server: {
			allowedHosts: true,
		},
		test: {
			// vitest 3.2.7 ignores a project-level `isolate` for the forks pool,
			// so the `shared` project is run with `--no-isolate` from the CLI
			// (see the `test` script) as a second invocation.
			projects: [
				{ extends: true, test: { name: 'shared', include: sharedTests } },
				{ extends: true, test: { name: 'isolated', include: isolatedTests } },
			],
			alias: { '@sentry/sveltekit': fileURLToPath(new URL('./tests/helpers/sentry-stub.ts', import.meta.url)) },
			globalSetup: ['tests/setup/global-setup.ts'],
			// Default reporter first; the skip summary prints below its
			// "Test Files … skipped" line, where a developer actually looks.
			reporters: ['default', './tests/setup/skip-summary-reporter.ts'],
			environment: 'node',
			globals: true,
			coverage: {
				provider: 'v8',
				include: ['src/**/*.ts'],
				exclude: ['src/**/*.d.ts'],
				thresholds: {
					lines: 75,
					'src/lib/formatters.ts': { lines: 80 },
					'src/lib/status.ts': { lines: 80 },
					'src/lib/server/extract.ts': { lines: 80 },
					'src/lib/server/products.ts': { lines: 80 },
					'src/lib/server/alert-engine.ts': { lines: 80 },
					'src/lib/server/db.ts': { lines: 80 },
					'src/lib/server/tenant.ts': { lines: 80 },
				},
			},
		},
	};
});
