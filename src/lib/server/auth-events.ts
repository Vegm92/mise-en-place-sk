/**
 * Auth telemetry (issue #256). Auth failure paths have no restaurantId, so
 * they can't use trackEvent; this emits a structured console line plus a
 * Sentry event so a credential-stuffing / brute-force wave or a broken auth
 * config is visible instead of silent.
 *
 * Rules: counts, never credentials. The password is never passed here in any
 * form, and emails are never logged in plaintext — a short salted-ish hash
 * (hashIp / truncated identifier) is the most that's ever recorded.
 */
import * as Sentry from '@sentry/sveltekit';
import { createHash } from 'node:crypto';

export type AuthEventKind =
	| 'login_failed'
	| 'login_rate_limited'
	| 'signup_rate_limited'
	| 'signup_failed'
	| 'oauth_error';

/** Short, non-reversible fingerprint of an IP for correlating attempts without storing it. */
export function hashIp(ip: string | null | undefined): string {
	if (!ip) return 'unknown';
	return createHash('sha256').update(ip).digest('hex').slice(0, 12);
}

export function logAuthEvent(kind: AuthEventKind, meta: Record<string, unknown> = {}): void {
	console.warn(`[auth] ${kind}`, meta);
	// Tagged Sentry event so alert rules can catch a spike; breadcrumb too for
	// context on any error that follows in the same request.
	Sentry.addBreadcrumb({ category: 'auth', level: 'warning', message: kind, data: meta });
	Sentry.captureMessage(`auth.${kind}`, { level: 'warning', tags: { authEvent: kind } });
}
