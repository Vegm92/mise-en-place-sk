const SENSITIVE_PARAMS = ['code', 'token', 'access_token', 'refresh_token', 'email'];

export function scrubUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl, 'http://scrub.local');
		let changed = false;
		for (const key of SENSITIVE_PARAMS) {
			if (url.searchParams.has(key)) {
				url.searchParams.set(key, '[redacted]');
				changed = true;
			}
		}
		if (!changed) return rawUrl;
		return rawUrl.startsWith('http') ? url.toString() : url.pathname + url.search + url.hash;
	} catch {
		return rawUrl;
	}
}

export function scrubSentryEvent<T extends { request?: { url?: string } }>(event: T): T {
	if (event.request?.url) {
		event.request.url = scrubUrl(event.request.url);
	}
	return event;
}
