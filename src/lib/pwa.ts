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

	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('/sw.js', { scope: '/' })
			.then(watchForUpdates)
			.catch((err) => {
				console.warn('[pwa] Service worker registration failed:', err);
			});
	});
}
