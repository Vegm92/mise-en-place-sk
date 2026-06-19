/**
 * Registers the Workbox-generated service worker produced by vite-plugin-pwa.
 * Called from +layout.svelte onMount so it runs only in the browser.
 *
 * We avoid injectRegister:'auto' from the plugin because SvelteKit's
 * mode:'hash' CSP computes hashes at SSR time and won't cover a script
 * injected post-build by Vite. Registering here from a compiled module is
 * CSP-safe — no inline script needed.
 */
export function registerPWA(): void {
	if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

	// vite-plugin-pwa only emits sw.js during production builds.
	if (import.meta.env.DEV) return;

	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('/sw.js', { scope: '/' })
			.then((reg) => {
				// When a new SW version is waiting, send SKIP_WAITING so it activates
				// immediately. vite-plugin-pwa's generateSW includes a SKIP_WAITING
				// message listener when registerType:'autoUpdate'.
				reg.addEventListener('updatefound', () => {
					const next = reg.installing;
					if (!next) return;
					next.addEventListener('statechange', () => {
						if (next.state === 'installed' && navigator.serviceWorker.controller) {
							next.postMessage({ type: 'SKIP_WAITING' });
						}
					});
				});
			})
			.catch((err) => {
				// Non-fatal — app works normally without a SW.
				console.warn('[pwa] Service worker registration failed:', err);
			});
	});
}
