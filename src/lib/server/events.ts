import * as Sentry from '@sentry/sveltekit';
import { db, runAsSystem } from './db';
import { systemNotifications, funnelEvents } from './schema';

export function trackEvent(
	event: string,
	restaurantId: string,
	payload?: Record<string, unknown>,
	invoiceId?: number | null,
): Promise<void> {
	return runAsSystem(async () => {
		await db.insert(systemNotifications)
			.values({
				restaurantId,
				notificationType: event,
				message: event,
				payload: payload ?? null,
				invoiceId: invoiceId ?? null,
				status: 'logged',
			});
	})
		.catch((e) => {
			console.error('[trackEvent] insert failed', e);
			Sentry.captureException(e);
		});
}

export function trackAnonymousEvent(
	event: string,
	payload?: Record<string, unknown>,
): void {
	runAsSystem(async () => {
		await db.insert(funnelEvents)
			.values({
				event,
				payload: payload ?? null,
			});
	})
		.catch((e) => {
			console.error('[trackAnonymousEvent] insert failed', e);
			Sentry.captureException(e);
		});
}
