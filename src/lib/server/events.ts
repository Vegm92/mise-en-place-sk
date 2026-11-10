import * as Sentry from '@sentry/sveltekit';
import { db } from './db';
import { activeTenantContext, runWithTenantContext } from './tenant-context';
import { systemNotifications } from './schema';

export async function trackEvent(
	event: string,
	restaurantId: string,
	payload?: Record<string, unknown>,
	invoiceId?: number | null,
): Promise<void> {
	const insert = async () => {
		await db.insert(systemNotifications)
			.values({
				restaurantId,
				notificationType: event,
				message: event,
				payload: payload ?? null,
				invoiceId: invoiceId ?? null,
				status: 'logged',
			});
	};
	try {
		const ctx = activeTenantContext();
		if (ctx && (ctx.mode === 'admin' || ctx.restaurantId === restaurantId)) await insert();
		else await runWithTenantContext(restaurantId, insert);
	} catch (e) {
		console.error('[trackEvent] insert failed', e);
		Sentry.captureException(e);
	}
}
