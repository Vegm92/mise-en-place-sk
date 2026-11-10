import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Sentry before importing events.ts
vi.mock('@sentry/sveltekit', () => ({
	captureException: vi.fn(),
}));

// Mock the DB module
const mockInsert = vi.fn();
vi.mock('$lib/server/db', () => ({
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

// Issue #1272 (SEC-011): trackEvent is awaited by its callers. Inside a scope
// for the same tenant (or a system scope) it inserts on that scope's own
// connection; with no matching scope it opens one for the event's restaurant.
const ctxMock = vi.hoisted(() => ({ active: undefined as { mode: 'tenant' | 'admin'; restaurantId: string | null } | undefined }));
const runWithTenantContextMock = vi.hoisted(() => vi.fn((_rid: string, fn: () => Promise<void>) => fn()));
vi.mock('../src/lib/server/tenant-context', () => ({
	activeTenantContext: () => ctxMock.active,
	runWithTenantContext: runWithTenantContextMock,
	runDetached: (_rid: string | null, fn: () => Promise<void>) => fn(),
}));

import { trackEvent } from '../src/lib/server/events';
import * as Sentry from '@sentry/sveltekit';

beforeEach(() => {
	vi.clearAllMocks();
	ctxMock.active = undefined;
});

describe('trackEvent', () => {
	it('inserts a row into systemNotifications', async () => {
		mockInsert.mockResolvedValue([]);
		await trackEvent('invoice_saved', 'rid-123', { confidence: 0.9, line_count: 3 }, 42);
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
		await expect(trackEvent('invoice_saved', 'rid-123')).resolves.toBeUndefined();
		expect(Sentry.captureException).toHaveBeenCalled();
	});

	it('reuses the ambient scope for the same tenant, without a second connection (#1272)', async () => {
		mockInsert.mockResolvedValue([]);
		ctxMock.active = { mode: 'tenant', restaurantId: 'rid-123' };
		await trackEvent('invoice_saved', 'rid-123');
		expect(runWithTenantContextMock).not.toHaveBeenCalled();
		expect(mockInsert).toHaveBeenCalledTimes(1);
	});

	it("opens a scope for the event's restaurant when none matches (#1272)", async () => {
		mockInsert.mockResolvedValue([]);
		await trackEvent('invoice_saved', 'rid-123');
		ctxMock.active = { mode: 'tenant', restaurantId: 'other' };
		await trackEvent('invoice_saved', 'rid-123');
		expect(runWithTenantContextMock).toHaveBeenCalledTimes(2);
		expect(runWithTenantContextMock.mock.calls[0]![0]).toBe('rid-123');
		expect(mockInsert).toHaveBeenCalledTimes(2);
	});

	it('stores null payload when none provided', async () => {
		mockInsert.mockResolvedValue([]);
		await trackEvent('file_uploaded', 'rid-456');
		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({ payload: null }),
		);
	});

	it('passes the payload through as an object, unserialised', async () => {
		mockInsert.mockResolvedValue([]);
		await trackEvent('duplicate_detected', 'rid-789', { supplier: 'Acme', amount: 100 });
		const call = mockInsert.mock.calls[0]![0] as { payload: Record<string, unknown> };
		expect(call.payload).toEqual({ supplier: 'Acme', amount: 100 });
	});
});
