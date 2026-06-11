import * as Sentry from '@sentry/sveltekit';
import { db } from './db';
import { systemNotifications } from './schema';

export function trackEvent(
	event: string,
	restaurantId: string,
	payload?: object,
	invoiceId?: number | null,
): void {
	db.insert(systemNotifications)
		.values({
			restaurantId,
			notificationType: event,
			message: event,
			payload: payload ? JSON.stringify(payload) : null,
			invoiceId: invoiceId ?? null,
			status: 'logged',
		})
		.catch((e) => {
			console.error('[trackEvent] insert failed', e);
			Sentry.captureException(e);
		});
}
