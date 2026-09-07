/**
 * `whatsapp-inbound` pg-boss queue (issue #997).
 *
 * The webhook route used to fire `handleWhatsAppMessage` without awaiting it
 * and answer 200 immediately — a handler failure (storage down, DB
 * unreachable, media download failing) reached only `console.error`, and
 * Meta was already told 200 so it never redelivered. The fix durably
 * enqueues the raw inbound message onto its own queue (separate from
 * `whatsapp-notify`, which is outbound-only — see extraction-worker.ts) so
 * the existing retry + dead-letter machinery covers the failure instead.
 *
 * `pg-boss` itself is mocked so this pins the plumbing: which queue the job
 * lands on, that it carries retry + dead-letter options, and that redelivery
 * of the same WhatsApp message id is deduplicated at the queue layer via
 * `singletonKey` (on top of the message-handler's own idempotency claim —
 * see whatsapp-bot.test.ts's "message-id dedup" suite for that layer).
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
	WHATSAPP_INBOUND_QUEUE,
	WHATSAPP_INBOUND_DEAD_LETTER_QUEUE,
	WHATSAPP_NOTIFY_QUEUE,
	DEAD_LETTER_QUEUES,
	enqueueWhatsAppInbound,
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

const MSG = { from: '+34600000001', id: 'wamid.abc123', type: 'image', image: { id: 'media-1' } };

describe('whatsapp-inbound queue is its own queue, not the outbound notify one (#997)', () => {
	it('is registered with its own dead-letter queue alongside every other queue', () => {
		expect(DEAD_LETTER_QUEUES).toContainEqual({
			source: WHATSAPP_INBOUND_QUEUE,
			deadLetter: WHATSAPP_INBOUND_DEAD_LETTER_QUEUE,
		});
	});

	it('is a distinct queue name from the outbound whatsapp-notify queue', () => {
		expect(WHATSAPP_INBOUND_QUEUE).not.toBe(WHATSAPP_NOTIFY_QUEUE);
	});
});

describe('enqueueWhatsAppInbound — durability (#997)', () => {
	it('sends the raw message onto the whatsapp-inbound queue with retry + dead-letter coverage', async () => {
		const ok = await enqueueWhatsAppInbound(MSG);

		expect(ok).toBe(true);
		expect(sendMock).toHaveBeenCalledWith(
			WHATSAPP_INBOUND_QUEUE,
			expect.objectContaining({ messageId: MSG.id, msg: MSG }),
			expect.objectContaining({
				retryLimit: 3,
				deadLetter: WHATSAPP_INBOUND_DEAD_LETTER_QUEUE,
				singletonKey: MSG.id,
			}),
		);
	});

	it('keys the job on the message id, so a redelivered webhook cannot double-enqueue an in-flight message', async () => {
		await enqueueWhatsAppInbound(MSG);
		await enqueueWhatsAppInbound(MSG);

		const singletonKeys = sendMock.mock.calls.map((call) => (call[2] as { singletonKey?: string }).singletonKey);
		expect(singletonKeys).toEqual([MSG.id, MSG.id]);
	});

	it('surfaces a pg-boss failure to the caller rather than reporting success', async () => {
		sendMock.mockRejectedValueOnce(new Error('pg-boss unreachable'));
		await expect(enqueueWhatsAppInbound(MSG)).rejects.toThrow('pg-boss unreachable');
	});
});
