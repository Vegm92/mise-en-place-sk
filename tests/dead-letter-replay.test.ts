/**
 * Dead-letter replay beyond `extract-invoice` (issue #1001), and the growth
 * thresholds that tell somebody the queue is filling up.
 *
 * The trap this suite exists to hold shut: the stored `payload` is redacted
 * before it is written — emails masked, strings cut at 512 chars, arrays capped
 * at 25 items. A replay that re-enqueues it verbatim runs a job with quietly
 * different data than the one that failed, and reports success. So the tests
 * assert not only which queues replay, but that the two whose data cannot
 * survive redaction refuse, and that the product queues take their text from
 * the products table rather than from the payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const enqueued = vi.hoisted(() => ({
	extraction: vi.fn(async () => true),
	normalize: vi.fn(async () => true),
	categorize: vi.fn(async () => true),
	whatsappNotify: vi.fn(async () => true),
}));

vi.mock('../src/lib/server/queue', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/lib/server/queue')>()),
	enqueueExtraction: enqueued.extraction,
	enqueueNormalize: enqueued.normalize,
	enqueueCategorize: enqueued.categorize,
	enqueueWhatsAppNotify: enqueued.whatsappNotify,
}));

const batchMocks = vi.hoisted(() => ({ markQueued: vi.fn(async () => true) }));
vi.mock('../src/lib/server/batch', () => ({ markQueued: batchMocks.markQueued }));

const productRows = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock('../src/lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({ where: () => ({ limit: async () => productRows.rows }) }),
		}),
	},
}));

const {
	ACCOUNT_CLEANUP_QUEUE, CATEGORIZE_QUEUE, EXTRACTION_QUEUE,
	NORMALIZE_QUEUE, WHATSAPP_INBOUND_QUEUE, WHATSAPP_NOTIFY_QUEUE,
} = await import('../src/lib/server/queue');
const { isReplayable, nonReplayableReason, replayDeadLetter } =
	await import('../src/lib/server/dead-letter-replay');
const { deadLetterAlert, DEAD_LETTER_ALERT_THRESHOLD } = await import('../src/lib/server/alerts');

const RID = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';

const entry = (queue: string, over: Record<string, unknown> = {}) => ({
	queue,
	sourceId: ITEM,
	restaurantId: RID,
	payload: { itemId: ITEM, restaurantId: RID },
	...over,
});

beforeEach(() => {
	vi.clearAllMocks();
	productRows.rows = [{ canonicalName: 'Tomate pera', restaurantId: RID }];
	batchMocks.markQueued.mockResolvedValue(true);
	for (const fn of Object.values(enqueued)) fn.mockResolvedValue(true);
});

describe('which queues offer a replay button', () => {
	it.each([EXTRACTION_QUEUE, NORMALIZE_QUEUE, CATEGORIZE_QUEUE, WHATSAPP_NOTIFY_QUEUE])(
		'%s is replayable',
		(queue) => {
			expect(isReplayable(entry(queue))).toBe(true);
			expect(nonReplayableReason(queue)).toBeNull();
		},
	);

	it.each([WHATSAPP_INBOUND_QUEUE, ACCOUNT_CLEANUP_QUEUE])(
		'%s is not, and says why',
		(queue) => {
			expect(isReplayable(entry(queue))).toBe(false);
			// The operator gets a reason on the row, not a missing button.
			expect(nonReplayableReason(queue)).toBeTruthy();
		},
	);

	it('does not mistake an inherited Object property for a replayer', async () => {
		// The lookups are Maps, not object literals: `REPLAYERS['constructor']`
		// would otherwise return Object and be called as the replayer.
		for (const queue of ['constructor', 'toString', '__proto__']) {
			expect(isReplayable(entry(queue))).toBe(false);
			expect(nonReplayableReason(queue)).toBeNull();
			expect(await replayDeadLetter(entry(queue)))
				.toEqual({ ok: false, error: 'notReplayable', status: 400 });
		}
	});

	it('an extract row with no source item is not replayable', () => {
		expect(isReplayable(entry(EXTRACTION_QUEUE, { sourceId: null }))).toBe(false);
		expect(isReplayable(entry(EXTRACTION_QUEUE, { restaurantId: null }))).toBe(false);
	});
});

describe('replaying a dead letter', () => {
	it('walks an extraction item back to queued before re-enqueuing it', async () => {
		const result = await replayDeadLetter(entry(EXTRACTION_QUEUE), 'req-1');

		expect(result).toEqual({ ok: true });
		expect(batchMocks.markQueued).toHaveBeenCalledWith(ITEM);
		expect(enqueued.extraction).toHaveBeenCalledWith(ITEM, RID, 'req-1');
	});

	it('refuses an extraction item that will not go back to queued', async () => {
		batchMocks.markQueued.mockResolvedValue(false);

		const result = await replayDeadLetter(entry(EXTRACTION_QUEUE));

		expect(result).toEqual({ ok: false, error: 'itemNotRequeueable', status: 409 });
		expect(enqueued.extraction).not.toHaveBeenCalled();
	});

	it('re-reads the product name instead of replaying the redacted payload', async () => {
		// The payload's copy of the text is deliberately wrong here: if replay used
		// it, the assertion below would see the truncated value.
		const dl = entry(NORMALIZE_QUEUE, {
			payload: { restaurantId: RID, productId: 7, rawText: 'Tomate p[+180 chars]' },
		});

		expect(await replayDeadLetter(dl, 'req-2')).toEqual({ ok: true });
		expect(enqueued.normalize).toHaveBeenCalledWith(RID, 7, 'Tomate pera', 'req-2');
	});

	it('does the same for categorize', async () => {
		const dl = entry(CATEGORIZE_QUEUE, { payload: { restaurantId: RID, productId: 7 } });

		expect(await replayDeadLetter(dl, 'req-3')).toEqual({ ok: true });
		expect(enqueued.categorize).toHaveBeenCalledWith(RID, 7, 'Tomate pera', 'req-3');
	});

	it('will not replay a product job whose product is gone', async () => {
		productRows.rows = [];

		const result = await replayDeadLetter(entry(NORMALIZE_QUEUE, {
			payload: { restaurantId: RID, productId: 7 },
		}));

		expect(result).toEqual({ ok: false, error: 'sourceMissing', status: 409 });
		expect(enqueued.normalize).not.toHaveBeenCalled();
	});

	it('will not replay a product job across tenants', async () => {
		productRows.rows = [{ canonicalName: 'Tomate pera', restaurantId: 'someone-else' }];

		const result = await replayDeadLetter(entry(CATEGORIZE_QUEUE, {
			payload: { restaurantId: RID, productId: 7 },
		}));

		expect(result).toEqual({ ok: false, error: 'sourceMissing', status: 409 });
		expect(enqueued.categorize).not.toHaveBeenCalled();
	});

	it('replays a whatsapp notification straight from its two ids', async () => {
		expect(await replayDeadLetter(entry(WHATSAPP_NOTIFY_QUEUE), 'req-4')).toEqual({ ok: true });
		expect(enqueued.whatsappNotify).toHaveBeenCalledWith(ITEM, RID, 'req-4');
	});

	it.each([WHATSAPP_INBOUND_QUEUE, ACCOUNT_CLEANUP_QUEUE])(
		'refuses %s rather than replaying a redacted payload',
		async (queue) => {
			const result = await replayDeadLetter(entry(queue));

			expect(result).toEqual({ ok: false, error: 'notReplayable', status: 400 });
			for (const fn of Object.values(enqueued)) expect(fn).not.toHaveBeenCalled();
		},
	);

	it('refuses a payload that is not the shape the queue expects', async () => {
		const result = await replayDeadLetter(entry(WHATSAPP_NOTIFY_QUEUE, {
			payload: { itemId: 'not-a-uuid', restaurantId: RID },
		}));

		expect(result).toEqual({ ok: false, error: 'notReplayable', status: 400 });
		expect(enqueued.whatsappNotify).not.toHaveBeenCalled();
	});

	it('reports an enqueue that did not take', async () => {
		enqueued.whatsappNotify.mockResolvedValue(false);

		expect(await replayDeadLetter(entry(WHATSAPP_NOTIFY_QUEUE)))
			.toEqual({ ok: false, error: 'enqueueFailed', status: 500 });
	});
});

describe('dead-letter growth thresholds (#1001)', () => {
	const growth = (byQueue: Array<{ queue: string; pending: number }>) => ({
		windowHours: 24,
		pending: byQueue.reduce((n, q) => n + q.pending, 0),
		byQueue,
	});

	it('stays quiet at and below the threshold', () => {
		expect(deadLetterAlert(growth([]))).toBeNull();
		expect(deadLetterAlert(growth([
			{ queue: NORMALIZE_QUEUE, pending: DEAD_LETTER_ALERT_THRESHOLD },
		]))).toBeNull();
	});

	it('warns once distinct pending rows pass the threshold', () => {
		const alert = deadLetterAlert(growth([
			{ queue: NORMALIZE_QUEUE, pending: DEAD_LETTER_ALERT_THRESHOLD },
			{ queue: CATEGORIZE_QUEUE, pending: 1 },
		]));

		expect(alert).toMatchObject({ level: 'warning', reason: 'threshold', pending: 11 });
	});

	it('escalates a single dead-lettered account deletion', () => {
		// One row is already a user who asked to be forgotten and has not been —
		// there is no second clock running on that anywhere in the system.
		const alert = deadLetterAlert(growth([{ queue: ACCOUNT_CLEANUP_QUEUE, pending: 1 }]));

		expect(alert).toMatchObject({
			level: 'error',
			reason: 'zeroTolerance',
			queues: [ACCOUNT_CLEANUP_QUEUE],
			pending: 1,
		});
	});

	it('reports the GDPR queue even when the overall count would only warn', () => {
		const alert = deadLetterAlert(growth([
			{ queue: NORMALIZE_QUEUE, pending: 40 },
			{ queue: ACCOUNT_CLEANUP_QUEUE, pending: 2 },
		]));

		expect(alert?.reason).toBe('zeroTolerance');
		expect(alert?.pending).toBe(2);
	});
});
