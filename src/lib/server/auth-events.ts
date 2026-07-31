import * as Sentry from '@sentry/sveltekit';
import { createHash } from 'node:crypto';

export type AuthEventKind =
	| 'login_failed'
	| 'login_rate_limited'
	| 'signup_rate_limited'
	| 'signup_failed'
	| 'oauth_error'
	| 'password_reset_requested'
	| 'password_reset_rate_limited'
	| 'password_reset_completed'
	| 'password_changed';

export function hashIp(ip: string | null | undefined): string {
	if (!ip) return 'unknown';
	return createHash('sha256').update(ip).digest('hex').slice(0, 12);
}

export function logAuthEvent(kind: AuthEventKind, meta: Record<string, unknown> = {}): void {
	console.warn(`[auth] ${kind}`, meta);
	Sentry.addBreadcrumb({ category: 'auth', level: 'warning', message: kind, data: meta });
	Sentry.captureMessage(`auth.${kind}`, { level: 'warning', tags: { authEvent: kind } });
}
