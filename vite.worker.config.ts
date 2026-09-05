import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Builds the two non-Kit Node entrypoints into build/:
 *   src/worker.ts              → build/worker.js              (run with `node build/worker.js`)
 *   src/wait-for-migrations.ts → build/wait-for-migrations.js (the worker service's Railway
 *                                                              preDeployCommand — waits until every
 *                                                              journal migration is applied)
 *
 * They share server modules with the SvelteKit app but run outside the Kit
 * runtime, so SvelteKit virtual modules are aliased to standalone equivalents.
 * Dependencies stay external (resolved from node_modules at runtime), matching
 * how adapter-node builds the web server. Shared code between the two entries
 * lands in build/worker-chunks/.
 */
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
	},
	build: {
		ssr: true,
		outDir: 'build',
		// The SvelteKit adapter-node output also lives in build/ — don't wipe it.
		emptyOutDir: false,
		target: 'node22',
		rollupOptions: {
			input: {
				worker: fileURLToPath(new URL('./src/worker.ts', import.meta.url)),
				'wait-for-migrations': fileURLToPath(new URL('./src/wait-for-migrations.ts', import.meta.url)),
			},
			output: {
				entryFileNames: '[name].js',
				chunkFileNames: 'worker-chunks/[name]-[hash].js',
			},
			external: ['@whiskeysockets/baileys', 'qrcode-terminal'],
		},
	},
});
