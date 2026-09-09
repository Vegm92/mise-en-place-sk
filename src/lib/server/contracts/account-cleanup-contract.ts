export const ACCOUNT_CLEANUP_QUEUE = 'account-cleanup';
export const ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE = `${ACCOUNT_CLEANUP_QUEUE}-dead-letter`;

export interface AccountCleanupJobData {
	itemId: string;
	restaurantId: string | null;
	stripeSubscriptionIds: string[];
	storageKeys: string[];
	requestId?: string;
}

export const ACCOUNT_CLEANUP_OPTIONS = (userId: string) => ({
	retryLimit: 5,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 900,
	expireInSeconds: 3600,
	singletonKey: userId,
	deadLetter: ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE,
});
