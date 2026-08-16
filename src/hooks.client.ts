import * as Sentry from '@sentry/sveltekit';
import { scrubSentryEvent } from '$lib/sentry-scrub';

const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN'] ?? '';
const SENTRY_RELEASE = import.meta.env['VITE_SENTRY_RELEASE'] || undefined;

Sentry.init({
	dsn: SENTRY_DSN,
	release: SENTRY_RELEASE,
	environment: import.meta.env['PROD'] ? 'production' : 'development',
	tracesSampleRate: import.meta.env['PROD'] ? 0.1 : 1.0,
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 1.0,
	integrations: [Sentry.replayIntegration()],
	sendDefaultPii: false,
	beforeSend: (event) => scrubSentryEvent(event),
});

export const handleError = Sentry.handleErrorWithSentry();
