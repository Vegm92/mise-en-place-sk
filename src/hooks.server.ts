import * as Sentry from '@sentry/sveltekit';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authHandle } from '$lib/server/auth';
import { cleanupStaleBatches } from '$lib/server/batch';
import { seedAdminUser } from '$lib/server/auth-seed';
import { entitlementHandle } from '$lib/server/entitlements';
import { scrubSentryEvent } from '$lib/sentry-scrub';
import { resolveTracesSampleRate } from '$lib/sentry-sample-rate';
import { assertProductionEnv, addressHeaderWarning, validateAdminSeedConfig } from '$lib/server/config';
import { startWorkerLivenessMonitor } from '$lib/server/worker-liveness-monitor';
import { createLogger } from '$lib/server/log';
import { startMetricFlush } from '$lib/server/metrics';
import { createAppHandle } from '$lib/server/request-policy';

export { applySecurityHeaders } from '$lib/server/request-policy';

const log = createLogger('hooks');

assertProductionEnv();
validateAdminSeedConfig();

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
const SENTRY_DSN = process.env.SENTRY_DSN ?? '';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || undefined;
const IS_PRODUCTION = NODE_ENV === 'production';

Sentry.init({
	dsn: SENTRY_DSN,
	release: SENTRY_RELEASE,
	environment: IS_PRODUCTION ? 'production' : 'development',
	tracesSampleRate: resolveTracesSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, IS_PRODUCTION),
	sendDefaultPii: false,
	integrations: integrations => integrations.filter(i => i.name !== 'Http'),
	beforeSend(event) {
		if (event.exception?.values?.some(v => v.type === 'Redirect')) return null;
		return scrubSentryEvent(event);
	},
});

export const handleError = Sentry.handleErrorWithSentry(
	({ error, event, status }: { error: unknown; event: RequestEvent; status: number }) => {
		if (status < 500) return;
		log.error('server error', { requestId: event?.locals?.requestId, err: error });
	},
);

function isNetworkUnreachable(e: unknown): boolean {
	const msg = String(e instanceof Error ? ((e as NodeJS.ErrnoException).code ?? (e.cause as Error | undefined)?.message ?? e.message) : e);
	return msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed');
}

const addressWarning = addressHeaderWarning();
if (addressWarning) log.warn(addressWarning);

if (!process.env.VITEST && NODE_ENV !== 'test') {
	cleanupStaleBatches().catch(e => { if (!isNetworkUnreachable(e)) log.error('batch cleanup error', { err: e }); });
}
seedAdminUser().catch(e => { if (!isNetworkUnreachable(e)) log.error('seed error', { err: e }); });
startWorkerLivenessMonitor();
startMetricFlush();

export const handle: Handle = sequence(Sentry.sentryHandle(), authHandle, createAppHandle(), entitlementHandle);
