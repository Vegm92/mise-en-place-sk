import * as Sentry from '@sentry/sveltekit';

const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN'] ?? '';

Sentry.init({
	dsn: SENTRY_DSN,
	tracesSampleRate: import.meta.env['PROD'] ? 0.1 : 1.0,
	sendDefaultPii: false,
});

export const handleError = Sentry.handleErrorWithSentry();
