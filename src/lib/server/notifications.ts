/**
 * Notifications service — persists alert objects to system_notifications.
 */
import { db } from './db';
import { systemNotifications } from './schema';
import type { Alert } from './alert-engine';

export async function saveAlerts(invoiceId: number, restaurantId: string, alerts: Alert[]): Promise<void> {
	if (alerts.length === 0) return;
	await db.transaction(async (tx) => {
		for (const alert of alerts) {
			await tx.insert(systemNotifications).values({
				invoiceId,
				restaurantId,
				notificationType: alert.notificationType,
				message: alert.message,
				payload: alert.payload ? JSON.stringify(alert.payload) : null,
				status: 'pending',
			});
		}
	});
}
