import * as Sentry from '@sentry/sveltekit';
import { scrubSentryEvent } from '$lib/sentry-scrub';

const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN'] ?? '';

Sentry.init({
	dsn: SENTRY_DSN,
	tracesSampleRate: import.meta.env['PROD'] ? 0.1 : 1.0,
	sendDefaultPii: false,
	// Strip live OAuth codes / tokens / emails from attached request URLs (#254).
	beforeSend: (event) => scrubSentryEvent(event),
});

export const handleError = Sentry.handleErrorWithSentry();
