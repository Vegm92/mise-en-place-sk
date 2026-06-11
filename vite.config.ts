import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
	// Vite loads .env into import.meta.env / $env only — server modules that
	// read process.env directly (env.ts, queue.ts, storage.ts) need this bridge in dev.
	const fileEnv = loadEnv(mode, process.cwd(), '');
	for (const [key, value] of Object.entries(fileEnv)) {
		process.env[key] ??= value;
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			allowedHosts: true,
		},
		test: {
			include: ['tests/**/*.test.ts'],
			environment: 'node',
			globals: true,
			coverage: {
				provider: 'v8',
				include: [
					'src/lib/formatters.ts',
					'src/lib/status.ts',
					'src/lib/server/extract.ts',
					'src/lib/server/unit-bridge.ts',
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
