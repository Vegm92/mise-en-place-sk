/**
 * Sentry PII scrubbing shared by the server and client inits (issue #254).
 *
 * Sentry attaches the request URL to events. Auth flows put short-lived
 * secrets in the query string — `/auth/callback?code=…` (a live OAuth code),
 * password-reset `token`s, and `email` — so an error during callback
 * processing would ship them to a third party. Redact those params in place
 * before the event leaves the process.
 */
const SENSITIVE_PARAMS = ['code', 'token', 'access_token', 'refresh_token', 'email'];

/** Redacts sensitive query params from a URL string. Returns it unchanged on parse failure. */
export function scrubUrl(rawUrl: string): string {
	try {
		// Support relative URLs by resolving against a dummy origin.
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

/** Scrubs the request URL on a Sentry event (mutates and returns it). */
export function scrubSentryEvent<T extends { request?: { url?: string } }>(event: T): T {
	if (event.request?.url) {
		event.request.url = scrubUrl(event.request.url);
	}
	return event;
}
