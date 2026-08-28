/**
 * `OK` / `NO` handling — the closing half of the WhatsApp round trip
 * (docs/03_features/whatsapp2.md).
 *
 * A confirmation flags the job reviewed and raises a reminder; it never writes
 * an invoice. There is one canonical invoice write path (invoice-save.ts,
 * ADR-008) and WhatsApp is not going to become a second one, so what the chef
 * gets is a nudge on /reminders rather than a saved row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	dbMock, claimMock, releaseMock, rateLimitMock, accessMock, selectQueue,
	findJobByCodeMock, pendingJobsForMock, setReviewStatusMock, raiseReviewMock,
} = vi.hoisted(() => {
	const selectQueue: unknown[][] = [];

	function chain(result: unknown) {
		const c: unknown = new Proxy({}, {
			get(_t, prop) {
				if (prop === 'then') {
					return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
						Promise.resolve(result).then(res, rej);
				}
				if (typeof prop === 'symbol') return undefined;
				return () => c;
			},
		});
		return c;
	}

	return {
		claimMock: vi.fn().mockResolvedValue(true),
		releaseMock: vi.fn().mockResolvedValue(undefined),
		rateLimitMock: vi.fn().mockResolvedValue(true),
		accessMock: vi.fn().mockResolvedValue({ allowed: true, trialExpired: false }),
		selectQueue,
		findJobByCodeMock: vi.fn(),
		pendingJobsForMock: vi.fn(),
		setReviewStatusMock: vi.fn(),
		raiseReviewMock: vi.fn().mockResolvedValue(undefined),
		dbMock: { select: vi.fn(() => chain(selectQueue.length ? selectQueue.shift() : [])) },
	};
});

vi.mock('../src/lib/server/db', () => ({
	db: dbMock,
	runAsSystem: (fn: () => unknown) => fn(),
	runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../src/lib/server/idempotency', () => ({
	WHATSAPP_SCOPE: 'whatsapp',
	claimIdempotencyKey: claimMock,
	releaseIdempotencyKey: releaseMock,
}));
vi.mock('../src/lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('../src/lib/server/billing', () => ({
	getAccessState: accessMock,
	ORPHAN_SUBSCRIPTIONS_QUEUE: 'scheduled-orphan-subscriptions',
	ORPHAN_SUBSCRIPTIONS_CRON: '50 3 * * *',
	runOrphanSubscriptionsJob: vi.fn(),
}));
vi.mock('../src/lib/server/integrations/whatsapp/jobs', async (importActual) => ({
	...(await importActual<typeof import('../src/lib/server/integrations/whatsapp/jobs')>()),
	findJobByCode: findJobByCodeMock,
	pendingJobsFor: pendingJobsForMock,
	setReviewStatus: setReviewStatusMock,
	raiseReviewNotification: raiseReviewMock,
	batchLink: (id: string) => `https://app.example.com/batch/${id}`,
}));

import { handleInboundMessage } from '../src/lib/server/integrations/whatsapp/message-handler';
import type { WhatsAppMessageContext } from '../src/lib/server/integrations/whatsapp/transport';

const CONTACT = [{ restaurantId: 'rest-1' }];

const JOB = {
	id: 'item-1', batchId: 'batch-1', restaurantId: 'rest-1', jobCode: 'A7K2',
	status: 'done', reviewStatus: 'pending',
	extractedData: { supplier_name: 'Frutas Paco' }, displayName: 'f.jpg',
};

function fakeTransport() {
	const sent: string[] = [];
	const ctx: WhatsAppMessageContext = {
		sendText: async (_to, body) => { sent.push(body); },
		downloadMedia: async () => ({ buffer: Buffer.alloc(0), extension: 'jpg' }),
	};
	return { ctx, sent };
}

function reply(body: string) {
	return { from: '34600', id: `m-${body}`, type: 'text', text: { body } };
}

beforeEach(() => {
	vi.clearAllMocks();
	selectQueue.length = 0;
	selectQueue.push(CONTACT);
	claimMock.mockResolvedValue(true);
	rateLimitMock.mockResolvedValue(true);
	setReviewStatusMock.mockResolvedValue(true);
	findJobByCodeMock.mockResolvedValue(null);
	pendingJobsForMock.mockResolvedValue([]);
});

describe('OK / NO from an authorised sender', () => {
	it('flags the coded job reviewed and raises a reminder', async () => {
		findJobByCodeMock.mockResolvedValue(JOB);
		const { ctx, sent } = fakeTransport();

		await handleInboundMessage(reply('OK A7K2'), ctx);

		expect(setReviewStatusMock).toHaveBeenCalledWith('item-1', 'reviewed', ['pending']);
		expect(raiseReviewMock).toHaveBeenCalledWith(JOB, 'reviewed');
		expect(sent.join('\n')).toMatch(/marcada como revisada/i);
		expect(sent.join('\n')).toContain('https://app.example.com/batch/batch-1');
	});

	it('flags a rejected job To Review', async () => {
		findJobByCodeMock.mockResolvedValue(JOB);
		const { ctx, sent } = fakeTransport();

		await handleInboundMessage(reply('NO A7K2'), ctx);

		expect(setReviewStatusMock).toHaveBeenCalledWith('item-1', 'to_review', ['pending']);
		expect(sent.join('\n')).toMatch(/To Review/i);
	});

	it('takes a bare OK when exactly one job is waiting', async () => {
		pendingJobsForMock.mockResolvedValue([JOB]);
		const { ctx } = fakeTransport();

		await handleInboundMessage(reply('ok'), ctx);

		expect(setReviewStatusMock).toHaveBeenCalledWith('item-1', 'reviewed', ['pending']);
	});

	it('asks for a code rather than guessing when several jobs are waiting', async () => {
		pendingJobsForMock.mockResolvedValue([JOB, { ...JOB, id: 'item-2', jobCode: 'B3M9' }]);
		const { ctx, sent } = fakeTransport();

		await handleInboundMessage(reply('ok'), ctx);

		expect(setReviewStatusMock).not.toHaveBeenCalled();
		expect(sent.join('\n')).toContain('A7K2');
		expect(sent.join('\n')).toContain('B3M9');
	});

	it('says so plainly when nothing is waiting', async () => {
		const { ctx, sent } = fakeTransport();

		await handleInboundMessage(reply('ok'), ctx);

		expect(setReviewStatusMock).not.toHaveBeenCalled();
		expect(sent.join('\n')).toMatch(/ninguna factura esperando/i);
	});

	it('names the code back when it matches nothing of the sender\'s', async () => {
		const { ctx, sent } = fakeTransport();

		await handleInboundMessage(reply('OK B3M9'), ctx);

		expect(pendingJobsForMock).not.toHaveBeenCalled();
		expect(sent.join('\n')).toContain('B3M9');
	});

	it('is idempotent: a repeated OK raises no second reminder', async () => {
		// The guarded UPDATE matched no row, so the job had already moved.
		findJobByCodeMock.mockResolvedValue(JOB);
		setReviewStatusMock.mockResolvedValue(false);
		const { ctx, sent } = fakeTransport();

		await handleInboundMessage(reply('OK A7K2'), ctx);

		expect(raiseReviewMock).not.toHaveBeenCalled();
		expect(sent.join('\n')).toMatch(/ya estaba revisada/i);
	});

	it('answers ordinary chat with a usage hint instead of a review', async () => {
		const { ctx, sent } = fakeTransport();

		await handleInboundMessage(reply('buenas, ¿me lees?'), ctx);

		expect(setReviewStatusMock).not.toHaveBeenCalled();
		expect(sent.join('\n')).toMatch(/Envíame una foto o PDF/i);
	});

	it('never consults billing for a text reply', async () => {
		// Reviewing what is already extracted costs nothing, so a lapsed
		// subscription must not swallow the answer.
		findJobByCodeMock.mockResolvedValue(JOB);
		const { ctx } = fakeTransport();

		await handleInboundMessage(reply('OK A7K2'), ctx);

		expect(accessMock).not.toHaveBeenCalled();
		expect(rateLimitMock).not.toHaveBeenCalled();
	});
});
