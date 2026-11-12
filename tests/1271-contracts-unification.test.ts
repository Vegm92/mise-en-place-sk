/**
 * Issue #1271 (RULE-352): account-deletion cleanup is the one job with a legal
 * deadline (GDPR Art. 12(3)), so it retries with backoff for ~24 h, tells an
 * admin the moment it is dead-lettered, and names its subject `userId`. Jobs
 * already queued under the old `itemId` name must keep working for one release.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { cancelSubscriptionMock, deleteMock, captureMessageMock } = vi.hoisted(() => ({
	cancelSubscriptionMock: vi.fn().mockResolvedValue(undefined),
	deleteMock: vi.fn().mockResolvedValue(undefined),
	captureMessageMock: vi.fn(),
}));

vi.mock('../src/lib/server/billing.js', () => ({ cancelSubscription: cancelSubscriptionMock }));
vi.mock('../src/lib/server/storage.js', () => ({ getStorage: () => ({ delete: deleteMock }) }));
vi.mock('@sentry/sveltekit', () => ({ captureMessage: captureMessageMock, captureException: vi.fn() }));
vi.mock('../src/lib/server/dead-letter', () => ({ deadLetterGrowth: vi.fn() }));

import {
	ACCOUNT_CLEANUP_OPTIONS,
	ACCOUNT_CLEANUP_QUEUE,
	accountCleanupUserId,
} from '../src/lib/server/contracts/account-cleanup-contract';
import { NORMALIZE_QUEUE } from '../src/lib/server/contracts/products-contract';
import { processAccountCleanupJob } from '../src/lib/server/account-cleanup';
import { alertOnDeadLetter } from '../src/lib/server/dead-letter-health';

const DAY_SECONDS = 24 * 60 * 60;

function shortestRetryWindowSeconds(): number {
	const { retryLimit, retryDelay, retryDelayMax } = ACCOUNT_CLEANUP_OPTIONS('u');
	let total = 0;
	for (let n = 0; n < retryLimit; n++) total += Math.min(retryDelayMax, retryDelay * 2 ** n);
	return total;
}

describe('account-cleanup keeps retrying for 24 hours', () => {
	it('even with the shortest pg-boss jitter the retries span at least a day', () => {
		expect(shortestRetryWindowSeconds()).toBeGreaterThanOrEqual(DAY_SECONDS);
	});

	it('and not much more than a day with the longest jitter', () => {
		const { retryLimit, retryDelay, retryDelayMax } = ACCOUNT_CLEANUP_OPTIONS('u');
		let total = 0;
		for (let n = 0; n < retryLimit; n++) total += Math.min(retryDelayMax, retryDelay * 2 ** (n + 1));
		expect(total).toBeLessThan(DAY_SECONDS * 1.1);
	});
});

describe('account-cleanup payload', () => {
	beforeEach(() => vi.clearAllMocks());

	it('reads the subject from userId', () => {
		expect(accountCleanupUserId({ userId: 'u-1', restaurantId: null, stripeSubscriptionIds: [], storageKeys: [] })).toBe('u-1');
	});

	it('still reads a job queued before the rename under itemId', () => {
		expect(accountCleanupUserId({ itemId: 'u-2', restaurantId: null, stripeSubscriptionIds: [], storageKeys: [] })).toBe('u-2');
	});

	it('the worker still runs a legacy itemId job to completion', async () => {
		await expect(processAccountCleanupJob({
			itemId: 'u-2',
			restaurantId: 'rest-1',
			stripeSubscriptionIds: ['sub_a'],
			storageKeys: ['invoices/a.pdf'],
		})).resolves.toBeUndefined();
		expect(cancelSubscriptionMock).toHaveBeenCalledWith('sub_a');
		expect(deleteMock).toHaveBeenCalledWith('invoices/a.pdf');
	});
});

describe('a dead-lettered account deletion alerts an admin straight away', () => {
	beforeEach(() => vi.clearAllMocks());

	it('raises the zero-tolerance alert for account-cleanup', () => {
		alertOnDeadLetter(ACCOUNT_CLEANUP_QUEUE);
		expect(captureMessageMock).toHaveBeenCalledWith(
			'Dead-lettered account deletion',
			expect.objectContaining({ level: 'error' }),
		);
	});

	it('leaves every other queue to the hourly schedule', () => {
		alertOnDeadLetter(NORMALIZE_QUEUE);
		expect(captureMessageMock).not.toHaveBeenCalled();
	});
});
