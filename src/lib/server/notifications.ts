/**
 * Notifications service — persists alert objects to system_notifications.
 */
import { db } from './db';
import { systemNotifications } from './schema';
import type { Alert } from './alert-engine';

export function saveAlerts(invoiceId: number, alerts: Alert[]): void {
	if (alerts.length === 0) return;
	db.transaction((tx) => {
		for (const alert of alerts) {
			tx.insert(systemNotifications).values({
				invoiceId,
				notificationType: alert.notificationType,
				message: alert.message,
				payload: alert.payload ? JSON.stringify(alert.payload) : null,
				status: 'pending',
			}).run();
		}
	});
}
