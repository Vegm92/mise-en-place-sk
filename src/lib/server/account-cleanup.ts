import { getStorage } from './storage.js';
import { cancelSubscription } from './billing.js';
import {
	accountCleanupUserId,
	type AccountCleanupJobData,
	type LegacyAccountCleanupJobData,
} from './contracts/account-cleanup-contract.js';

export async function processAccountCleanupJob(data: AccountCleanupJobData | LegacyAccountCleanupJobData): Promise<void> {
	const userId = accountCleanupUserId(data);
	const errors: unknown[] = [];

	for (const subscriptionId of data.stripeSubscriptionIds) {
		try {
			await cancelSubscription(subscriptionId);
		} catch (err) {
			errors.push(err);
			console.error(`[account-cleanup] Stripe cancel failed for subscription=${subscriptionId} user=${userId}:`, err);
		}
	}

	const storage = getStorage();
	for (const key of data.storageKeys) {
		try {
			await storage.delete(key);
		} catch (err) {
			errors.push(err);
			console.error(`[account-cleanup] file delete failed for key=${key} user=${userId}:`, err);
		}
	}

	if (errors.length > 0) {
		const total = data.stripeSubscriptionIds.length + data.storageKeys.length;
		throw new AggregateError(errors, `account-cleanup: ${errors.length}/${total} step(s) failed for user=${userId}`);
	}
}
