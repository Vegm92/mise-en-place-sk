/**
 * Issue #1002 — the correlation id must land in the pg-boss job payload at
 * every enqueue site, so `dead_letter_queue.payload` and the worker's
 * `job.data` can be joined back to the web request that created the job.
 *
 * `pg-boss` itself is mocked (as in queue-whatsapp-inbound.test.ts) so this
 * pins the actual payload handed to `b.send(...)` for every queue in
 * queue.ts, not just what the wrapper function returns.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { sendMock, createQueueMock, updateQueueMock, startMock } = vi.hoisted(() => ({
	sendMock: vi.fn().mockResolvedValue('job-1'),
	createQueueMock: vi.fn().mockResolvedValue(undefined),
	updateQueueMock: vi.fn().mockResolvedValue(undefined),
	startMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('pg-boss', () => ({
	PgBoss: vi.fn().mockImplementation(() => ({
		start: startMock,
		createQueue: createQueueMock,
		updateQueue: updateQueueMock,
		send: sendMock,
	})),
}));

import {
	enqueueExtraction,
	enqueueNormalize,
	enqueueCategorize,
	enqueueWhatsAppNotify,
	enqueueWhatsAppInbound,
	enqueueAccountCleanup,
} from '../src/lib/server/queue';

const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
	vi.clearAllMocks();
	sendMock.mockResolvedValue('job-1');
	process.env.DATABASE_URL = 'postgres://localhost:5432/mep_test';
});

afterAll(() => {
	process.env.DATABASE_URL = originalDatabaseUrl;
});

function payloadOf(callIndex = 0): Record<string, unknown> {
	return sendMock.mock.calls[callIndex][1] as Record<string, unknown>;
}

describe('enqueue* functions carry the caller\'s requestId into the pg-boss job payload', () => {
	it('enqueueExtraction', async () => {
		await enqueueExtraction('item-1', 'rest-1', 'req-abc');
		expect(payloadOf()).toEqual(expect.objectContaining({ itemId: 'item-1', restaurantId: 'rest-1', requestId: 'req-abc' }));
	});

	it('enqueueNormalize', async () => {
		await enqueueNormalize('rest-1', 42, 'Naranja', 'req-abc');
		expect(payloadOf()).toEqual(expect.objectContaining({ restaurantId: 'rest-1', productId: 42, rawText: 'Naranja', requestId: 'req-abc' }));
	});

	it('enqueueCategorize', async () => {
		await enqueueCategorize('rest-1', 42, 'Naranja', 'req-abc');
		expect(payloadOf()).toEqual(expect.objectContaining({ restaurantId: 'rest-1', productId: 42, canonicalName: 'Naranja', requestId: 'req-abc' }));
	});

	it('enqueueWhatsAppNotify', async () => {
		await enqueueWhatsAppNotify('item-1', 'rest-1', 'req-abc');
		expect(payloadOf()).toEqual(expect.objectContaining({ itemId: 'item-1', restaurantId: 'rest-1', requestId: 'req-abc' }));
	});

	it('enqueueWhatsAppInbound', async () => {
		const msg = { from: '+34600000001', id: 'wamid.abc', type: 'text' };
		await enqueueWhatsAppInbound(msg, 'req-abc');
		expect(payloadOf()).toEqual(expect.objectContaining({ messageId: 'wamid.abc', msg, requestId: 'req-abc' }));
	});

	it('enqueueAccountCleanup', async () => {
		await enqueueAccountCleanup('user-1', 'rest-1', ['sub-1'], ['key-1'], 'req-abc');
		expect(payloadOf()).toEqual(expect.objectContaining({ itemId: 'user-1', restaurantId: 'rest-1', requestId: 'req-abc' }));
	});

	it('omits nothing but the id itself when the caller has none to give', async () => {
		await enqueueExtraction('item-2', 'rest-1');
		expect(payloadOf().requestId).toBeUndefined();
		expect(payloadOf()).toEqual(expect.objectContaining({ itemId: 'item-2', restaurantId: 'rest-1' }));
	});
});
