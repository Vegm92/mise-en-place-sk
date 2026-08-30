import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Builds src/worker.ts into build/worker.js (run with `node build/worker.js`).
 *
 * The worker shares server modules with the SvelteKit app but runs outside the
 * Kit runtime, so SvelteKit virtual modules are aliased to standalone
 * equivalents. Dependencies stay external (resolved from node_modules at
 * runtime), matching how adapter-node builds the web server.
 */
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
	},
	build: {
		ssr: 'src/worker.ts',
		outDir: 'build',
		// The SvelteKit adapter-node output also lives in build/ — don't wipe it.
		emptyOutDir: false,
		target: 'node22',
		rollupOptions: {
			output: { entryFileNames: 'worker.js' },
			external: ['@whiskeysockets/baileys', 'qrcode-terminal'],
		},
	},
});
