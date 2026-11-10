export const ACCOUNT_CLEANUP_QUEUE = 'account-cleanup';
export const ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE = `${ACCOUNT_CLEANUP_QUEUE}-dead-letter`;

export interface AccountCleanupJobData {
	userId: string;
	restaurantId: string | null;
	stripeSubscriptionIds: string[];
	storageKeys: string[];
	requestId?: string | undefined;
}

export type LegacyAccountCleanupJobData = Omit<AccountCleanupJobData, 'userId'> & { itemId: string };

export function accountCleanupUserId(data: AccountCleanupJobData | LegacyAccountCleanupJobData): string {
	return 'userId' in data && data.userId ? data.userId : (data as LegacyAccountCleanupJobData).itemId;
}

export const ACCOUNT_CLEANUP_OPTIONS = (userId: string) => ({
	retryLimit: 29,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 3600,
	expireInSeconds: 3600,
	singletonKey: userId,
	deadLetter: ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE,
});
