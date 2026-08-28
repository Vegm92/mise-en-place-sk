const SENSITIVE_PARAMS = ['code', 'token', 'access_token', 'refresh_token', 'email'];
const SENSITIVE_KEYS = [...SENSITIVE_PARAMS, 'authorization', 'cookie', 'set-cookie'];
const REDACTED = '[redacted]';
const MAX_SCRUB_DEPTH = 6;
const URL_IN_TEXT = /https?:\/\/\S+/g;

export function scrubUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl, 'https://scrub.local');
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

function scrubUrlsInText(text: string): string {
	return text.replace(URL_IN_TEXT, match => scrubUrl(match));
}

function isSensitiveKey(key: string): boolean {
	return SENSITIVE_KEYS.includes(key.toLowerCase());
}

function scrubArrayInPlace(items: unknown[], seen: WeakSet<object>, depth: number): void {
	for (let i = 0; i < items.length; i++) {
		const item: unknown = items[i];
		if (typeof item === 'string') {
			items[i] = scrubUrlsInText(item);
		} else {
			scrubValueInPlace(item, seen, depth + 1);
		}
	}
}

function scrubEntryInPlace(record: Record<string, unknown>, key: string, seen: WeakSet<object>, depth: number): void {
	const entry = record[key];
	if (isSensitiveKey(key)) {
		if (entry !== undefined) record[key] = REDACTED;
		return;
	}
	if (typeof entry === 'string') {
		record[key] = key.toLowerCase() === 'url' ? scrubUrl(entry) : scrubUrlsInText(entry);
		return;
	}
	scrubValueInPlace(entry, seen, depth + 1);
}

function scrubValueInPlace(value: unknown, seen: WeakSet<object>, depth: number): void {
	if (depth > MAX_SCRUB_DEPTH || value === null || typeof value !== 'object') return;
	if (seen.has(value)) return;
	seen.add(value);

	if (Array.isArray(value)) {
		scrubArrayInPlace(value, seen, depth);
		return;
	}

	const record = value as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		scrubEntryInPlace(record, key, seen, depth);
	}
}

function scrubHeaders(headers: Record<string, string>): void {
	for (const key of Object.keys(headers)) {
		if (isSensitiveKey(key)) headers[key] = REDACTED;
	}
}

function scrubCookies(cookies: Record<string, string>): void {
	for (const key of Object.keys(cookies)) {
		cookies[key] = REDACTED;
	}
}

interface ScrubbableEvent {
	request?: {
		url?: string;
		headers?: Record<string, string>;
		cookies?: Record<string, string>;
	};
	extra?: Record<string, unknown>;
	breadcrumbs?: Array<{
		message?: string;
		data?: Record<string, unknown>;
	}>;
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
	const seen = new WeakSet<object>();

	if (event.request?.url) {
		event.request.url = scrubUrl(event.request.url);
	}
	if (event.request?.headers) {
		scrubHeaders(event.request.headers);
	}
	if (event.request?.cookies) {
		scrubCookies(event.request.cookies);
	}
	if (event.extra) {
		scrubValueInPlace(event.extra, seen, 0);
	}
	if (event.breadcrumbs) {
		for (const crumb of event.breadcrumbs) {
			if (typeof crumb.message === 'string') {
				crumb.message = scrubUrlsInText(crumb.message);
			}
			if (crumb.data) {
				scrubValueInPlace(crumb.data, seen, 0);
			}
		}
	}

	return event;
}
