import { APP_BASE_URL } from './env';

export function siteOrigin(url: URL): string {
	const configured = APP_BASE_URL.replace(/\/+$/, '');
	return configured || url.origin;
}

export function canonicalUrl(url: URL, path: string): string {
	return `${siteOrigin(url)}${path}`;
}
