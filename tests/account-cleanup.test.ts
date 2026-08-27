/**
 * Issue #492: after account deletion commits, Stripe cancellation and stored
 * file deletion happen out-of-band via a retryable pg-boss job
 * (`ACCOUNT_CLEANUP_QUEUE`, wired through `worker.ts`'s existing
 * `runWithDeadLetter` dead-letter pattern — the same mechanism every other
 * background job in this codebase uses). `processAccountCleanupJob` is the
 * job body: these tests exercise it directly, without a real pg-boss
 * instance, the same way `extraction-worker.test.ts` unit-tests its handler.
 *
 * The job must attempt every id/key even when an earlier one fails (a
 * cancelled Stripe subscription must not block an orphaned file from being
 * cleaned up, and vice versa), and must throw when anything failed — the
 * signal `runWithDeadLetter` needs to retry the job, and eventually record it
 * in the dead-letter queue for manual/automated reconciliation once retries
 * are exhausted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { cancelSubscriptionMock, deleteMock } = vi.hoisted(() => ({
	cancelSubscriptionMock: vi.fn(),
	deleteMock: vi.fn(),
}));

vi.mock('../src/lib/server/billing.js', () => ({
	cancelSubscription: cancelSubscriptionMock,
}));
vi.mock('../src/lib/server/storage.js', () => ({
	getStorage: () => ({ delete: deleteMock }),
}));

import { processAccountCleanupJob } from '../src/lib/server/account-cleanup';

beforeEach(() => {
	cancelSubscriptionMock.mockReset().mockResolvedValue(undefined);
	deleteMock.mockReset().mockResolvedValue(undefined);
});

describe('processAccountCleanupJob (issue #492)', () => {
	it('cancels every Stripe subscription and deletes every stored file', async () => {
		await processAccountCleanupJob({
			itemId: 'user-1',
			restaurantId: 'rest-1',
			stripeSubscriptionIds: ['sub_a', 'sub_b'],
			storageKeys: ['invoices/a.pdf', 'invoices/b.pdf'],
		});

		expect(cancelSubscriptionMock).toHaveBeenCalledWith('sub_a');
		expect(cancelSubscriptionMock).toHaveBeenCalledWith('sub_b');
		expect(deleteMock).toHaveBeenCalledWith('invoices/a.pdf');
		expect(deleteMock).toHaveBeenCalledWith('invoices/b.pdf');
	});

	it('is a no-op when there is nothing to clean up', async () => {
		await expect(processAccountCleanupJob({
			itemId: 'user-1',
			restaurantId: null,
			stripeSubscriptionIds: [],
			storageKeys: [],
		})).resolves.toBeUndefined();
		expect(cancelSubscriptionMock).not.toHaveBeenCalled();
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it('a failed Stripe cancel still lets a later file delete run, then throws so the job retries', async () => {
		cancelSubscriptionMock.mockRejectedValueOnce(new Error('stripe unavailable'));

		await expect(processAccountCleanupJob({
			itemId: 'user-1',
			restaurantId: 'rest-1',
			stripeSubscriptionIds: ['sub_a'],
			storageKeys: ['invoices/a.pdf'],
		})).rejects.toThrow();

		expect(deleteMock).toHaveBeenCalledWith('invoices/a.pdf');
	});

	it('a failed file delete does not block an earlier Stripe cancel, then throws so the job retries', async () => {
		deleteMock.mockRejectedValueOnce(new Error('storage unavailable'));

		await expect(processAccountCleanupJob({
			itemId: 'user-1',
			restaurantId: 'rest-1',
			stripeSubscriptionIds: ['sub_a'],
			storageKeys: ['invoices/a.pdf'],
		})).rejects.toThrow();

		expect(cancelSubscriptionMock).toHaveBeenCalledWith('sub_a');
	});

	it('resolves cleanly once every step succeeds (the eventual-retry-success path)', async () => {
		cancelSubscriptionMock.mockResolvedValue(undefined);
		deleteMock.mockResolvedValue(undefined);

		await expect(processAccountCleanupJob({
			itemId: 'user-1',
			restaurantId: 'rest-1',
			stripeSubscriptionIds: ['sub_a', 'sub_b'],
			storageKeys: ['invoices/a.pdf'],
		})).resolves.toBeUndefined();
	});
});
