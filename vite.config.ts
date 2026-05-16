import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		globals: true,
		coverage: {
			provider: 'v8',
			include: ['src/lib/server/**/*.ts'],
			thresholds: {
				lines: 70,
			},
		},
	},
});
