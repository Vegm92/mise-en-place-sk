import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
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
			],
			thresholds: {
				lines: 80,
			},
		},
	},
});

