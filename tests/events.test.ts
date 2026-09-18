import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Sentry before importing events.ts
vi.mock('@sentry/sveltekit', () => ({
	captureException: vi.fn(),
}));

// Mock the DB module
const mockInsert = vi.fn();
vi.mock('../src/lib/server/db', () => ({
	db: {
		insert: () => ({
			values: mockInsert,
		}),
	},
}));

// Mock schema — value doesn't matter, just needs to be a reference
vi.mock('../src/lib/server/schema', () => ({
	systemNotifications: {},
	funnelEvents: {},
}));

// Issue #1073: the insert must run through runDetached so a fire-and-forget
// trackEvent() never queries on the caller's (soon released) reserved
// connection. The real helper runs fn() directly when no scope is active,
// which is the case here; the spy pins that it is the path taken.
const runDetachedMock = vi.hoisted(() => vi.fn((_rid: string | null, fn: () => Promise<void>) => fn()));
vi.mock('../src/lib/server/tenant-context', () => ({ runDetached: runDetachedMock }));

import { trackEvent } from '../src/lib/server/events';
import * as Sentry from '@sentry/sveltekit';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('trackEvent', () => {
	it('inserts a row into systemNotifications', () => {
		mockInsert.mockResolvedValue([]);
		trackEvent('invoice_saved', 'rid-123', { confidence: 0.9, line_count: 3 }, 42);
		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				restaurantId: 'rid-123',
				notificationType: 'invoice_saved',
				invoiceId: 42,
				payload: { confidence: 0.9, line_count: 3 },
			}),
		);
	});

	it('does not throw when DB insert fails', async () => {
		mockInsert.mockRejectedValue(new Error('db down'));
		expect(() => trackEvent('invoice_saved', 'rid-123')).not.toThrow();
		// Let the rejected promise settle
		await new Promise(r => setTimeout(r, 0));
		expect(Sentry.captureException).toHaveBeenCalled();
	});

	it('detaches the insert from the ambient tenant scope under the event\'s own restaurant (#1073)', () => {
		mockInsert.mockResolvedValue([]);
		trackEvent('invoice_saved', 'rid-123');
		expect(runDetachedMock).toHaveBeenCalledTimes(1);
		expect(runDetachedMock.mock.calls[0]![0]).toBe('rid-123');
		expect(mockInsert).toHaveBeenCalledTimes(1);
	});

	it('stores null payload when none provided', () => {
		mockInsert.mockResolvedValue([]);
		trackEvent('file_uploaded', 'rid-456');
		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({ payload: null }),
		);
	});

	it('passes the payload through as an object, unserialised', () => {
		mockInsert.mockResolvedValue([]);
		trackEvent('duplicate_detected', 'rid-789', { supplier: 'Acme', amount: 100 });
		const call = mockInsert.mock.calls[0]![0] as { payload: Record<string, unknown> };
		expect(call.payload).toEqual({ supplier: 'Acme', amount: 100 });
	});
});
