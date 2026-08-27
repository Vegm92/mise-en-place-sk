import { getStorage } from './storage.js';
import { cancelSubscription } from './billing.js';

export interface AccountCleanupJobData {
	itemId: string;
	restaurantId: string | null;
	stripeSubscriptionIds: string[];
	storageKeys: string[];
}

export async function processAccountCleanupJob(data: AccountCleanupJobData): Promise<void> {
	const errors: unknown[] = [];

	for (const subscriptionId of data.stripeSubscriptionIds) {
		try {
			await cancelSubscription(subscriptionId);
		} catch (err) {
			errors.push(err);
			console.error(`[account-cleanup] Stripe cancel failed for subscription=${subscriptionId} user=${data.itemId}:`, err);
		}
	}

	const storage = getStorage();
	for (const key of data.storageKeys) {
		try {
			await storage.delete(key);
		} catch (err) {
			errors.push(err);
			console.error(`[account-cleanup] file delete failed for key=${key} user=${data.itemId}:`, err);
		}
	}

	if (errors.length > 0) {
		const total = data.stripeSubscriptionIds.length + data.storageKeys.length;
		throw new AggregateError(errors, `account-cleanup: ${errors.length}/${total} step(s) failed for user=${data.itemId}`);
	}
}
