import * as Sentry from '@sentry/sveltekit';
import { db } from './db';
import { runDetached } from './tenant-context';
import { systemNotifications, funnelEvents } from './schema';

export async function trackEvent(
	event: string,
	restaurantId: string,
	payload?: Record<string, unknown>,
	invoiceId?: number | null,
): Promise<void> {
	try {
		await runDetached(restaurantId, async () => {
			await db.insert(systemNotifications)
				.values({
					restaurantId,
					notificationType: event,
					message: event,
					payload: payload ?? null,
					invoiceId: invoiceId ?? null,
					status: 'logged',
				});
		});
	} catch (e) {
		console.error('[trackEvent] insert failed', e);
		Sentry.captureException(e);
	}
}

export function trackAnonymousEvent(
	event: string,
	payload?: Record<string, unknown>,
): void {
	runDetached(null, async () => {
		await db.insert(funnelEvents)
			.values({
				event,
				payload: payload ?? null,
			});
	}).catch((e) => {
		console.error('[trackAnonymousEvent] insert failed', e);
		Sentry.captureException(e);
	});
}
