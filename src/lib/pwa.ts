function watchForUpdates(reg: ServiceWorkerRegistration): void {
	reg.addEventListener('updatefound', () => {
		const next = reg.installing;
		if (!next) return;
		next.addEventListener('statechange', () => {
			if (next.state === 'installed' && navigator.serviceWorker.controller) {
				next.postMessage({ type: 'SKIP_WAITING' });
			}
		});
	});
}

export function registerPWA(): void {
	if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

	if (import.meta.env.DEV) return;

	const register = () => {
		navigator.serviceWorker
			.register('/sw.js', { scope: '/' })
			.then(watchForUpdates)
			.catch((err) => {
				console.warn('[pwa] Service worker registration failed:', err);
			});
	};
	// Kit 3 can hydrate after the load event, which would never fire again.
	if (document.readyState === 'complete') register();
	else window.addEventListener('load', register, { once: true });
}
