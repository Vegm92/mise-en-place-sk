import * as Sentry from '@sentry/sveltekit';
import { scrubSentryEvent } from '$lib/sentry-scrub';
import { resolveTracesSampleRate } from '$lib/sentry-sample-rate';

const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN'] ?? '';
const SENTRY_RELEASE = import.meta.env['VITE_SENTRY_RELEASE'] || undefined;
const IS_PRODUCTION = Boolean(import.meta.env['PROD']);

Sentry.init({
	dsn: SENTRY_DSN,
	release: SENTRY_RELEASE,
	environment: IS_PRODUCTION ? 'production' : 'development',
	tracesSampleRate: resolveTracesSampleRate(import.meta.env['VITE_SENTRY_TRACES_SAMPLE_RATE'], IS_PRODUCTION),
	replaysSessionSampleRate: 1.0,
	replaysOnErrorSampleRate: 1.0,
	integrations: [Sentry.replayIntegration()],
	sendDefaultPii: false,
	beforeSend: (event) => scrubSentryEvent(event),
});

export const handleError = Sentry.handleErrorWithSentry();
