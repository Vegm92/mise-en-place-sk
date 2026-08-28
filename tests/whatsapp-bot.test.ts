/**
 * WhatsApp invoice bot — message routing & batch-pipeline handoff (feat #108,
 * issue #350).
 *
 * The bot is the conversational layer over ingestion: it authorises the
 * sending number, routes media vs. text, and hands media off to the shared
 * upload_batches/batch_items pipeline (issue #349). The legacy inline
 * SÍ/NO confirmation handshake was removed in #350 — see
 * whatsapp-bridge.test.ts for the media-upload → batch flow itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, sendMock, downloadMock, rateLimitMock, redeemMock, accessMock, lockedMock, selectQueue, insertQueue } = vi.hoisted(() => {
	const selectQueue: unknown[][] = [];
	const insertQueue: unknown[][] = [];

	// A chainable, thenable stub: every method returns itself; awaiting resolves
	// to `result`. Used for select/update/insert builders.
	function chain(result: unknown) {
		const c: unknown = new Proxy(
			{},
			{
				get(_t, prop) {
					if (prop === 'then') {
						return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
							Promise.resolve(result).then(res, rej);
					}
					if (typeof prop === 'symbol') return undefined;
					return () => c;
				},
			},
		);
		return c;
	}

	const dbMock = {
		// Each select() consumes the next queued result set (FIFO).
		select: vi.fn(() => chain(selectQueue.length ? selectQueue.shift() : [])),
		update: vi.fn(() => chain([{ id: 7 }])),
		// insert() consumes the next queued result set; default non-empty so the
		// message-id claim reads as a new (non-duplicate) message.
		insert: vi.fn(() => chain(insertQueue.length ? insertQueue.shift() : [{ messageId: 'seed' }])),
	};

	return {
		dbMock,
		sendMock: vi.fn().mockResolvedValue(undefined),
		downloadMock: vi.fn(),
		// Cooldown gate defaults to "allowed" — the real limiter keeps state
		// across tests, which would make ordering matter.
		rateLimitMock: vi.fn().mockResolvedValue(true),
		redeemMock: vi.fn(),
		// Billing access defaults to "live" so the pre-existing media tests keep
		// exercising the upload path rather than the new refusal branch.
		accessMock: vi.fn().mockResolvedValue({
			allowed: true, status: 'active', trialEndsAt: null, trialExpired: false,
		}),
		// The location-allowance gate (#679) defaults to "inside the plan" for the
		// same reason: only the dedicated test flips it.
		lockedMock: vi.fn().mockResolvedValue(false),
		selectQueue,
		insertQueue,
	};
});

vi.mock('../src/lib/server/db', () => ({
	db: dbMock,
	runAsSystem: (fn: () => unknown) => fn(),
	runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../src/lib/server/whatsapp', () => ({
	sendWhatsAppMessage: sendMock,
	downloadWhatsAppMedia: downloadMock,
}));
vi.mock('../src/lib/server/storage', () => ({ getStorage: () => ({ save: vi.fn() }) }));
vi.mock('../src/lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('../src/lib/server/billing', () => ({
	getAccessState: accessMock,
	ORPHAN_SUBSCRIPTIONS_QUEUE: 'scheduled-orphan-subscriptions',
	ORPHAN_SUBSCRIPTIONS_CRON: '50 3 * * *',
	runOrphanSubscriptionsJob: vi.fn(),
}));
vi.mock('../src/lib/server/locations', () => ({ isLocationLocked: lockedMock }));
// Keep the real normalizeCode: whether a message *looks* like a code is the
// routing decision under test here, so stubbing it would test nothing.
vi.mock('../src/lib/server/whatsapp-pairing', async (importActual) => ({
	...(await importActual<typeof import('../src/lib/server/whatsapp-pairing')>()),
	redeemPairingCode: redeemMock,
}));
vi.mock('../src/lib/server/batch', () => ({
	createBatch: vi.fn().mockResolvedValue({ batchId: 'batch-1', itemIds: ['item-1'] }),
	getItem: vi.fn(),
	getBatchItems: vi.fn(),
	markQueued: vi.fn(),
}));
vi.mock('../src/lib/server/extract-batch', () => ({ enqueueBatchExtraction: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/lib/server/queue', () => ({ enqueueExtraction: vi.fn().mockResolvedValue(true) }));
vi.mock('@sentry/sveltekit', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { handleWhatsAppMessage } from '../src/lib/server/whatsapp-bot';

const CONTACT = [{ restaurantId: 'rest-1' }];

/** Queue the result sets db.select() will return, in call order. */
function queueSelects(...sets: unknown[][]) {
	selectQueue.length = 0;
	selectQueue.push(...sets);
}

/** The combined body text of every reply the bot sent (signature: send(to, body)). */
function repliesText() {
	return sendMock.mock.calls.map((c) => c[1] as string).join('\n');
}

beforeEach(() => {
	vi.clearAllMocks();
	selectQueue.length = 0;
	insertQueue.length = 0;
	rateLimitMock.mockResolvedValue(true);
	accessMock.mockResolvedValue({
		allowed: true, status: 'active', trialEndsAt: null, trialExpired: false,
	});
});

describe('billing gate on ingestion', () => {
	it('refuses media and downloads nothing when the trial has expired', async () => {
		queueSelects(CONTACT);
		accessMock.mockResolvedValue({
			allowed: false, status: 'trialing', trialEndsAt: new Date(0), trialExpired: true,
		});

		await handleWhatsAppMessage({ from: '+34600', id: 'g1', type: 'image', image: { id: 'media-1' } });

		expect(downloadMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/prueba gratuita/i);
	});

	it('refuses a document when the subscription is inactive', async () => {
		queueSelects(CONTACT);
		accessMock.mockResolvedValue({
			allowed: false, status: 'canceled', trialEndsAt: null, trialExpired: false,
		});

		await handleWhatsAppMessage({ from: '+34600', id: 'g2', type: 'document', document: { id: 'media-2' } });

		expect(downloadMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/suscripción no está activa/i);
	});

	it('does not consult billing for a plain text message', async () => {
		queueSelects(CONTACT);
		await handleWhatsAppMessage({ from: '+34600', id: 'g3', type: 'text', text: { body: 'hola' } });
		expect(accessMock).not.toHaveBeenCalled();
	});
});

describe('message-id dedup (issue #245)', () => {
	it('skips a redelivered message before any work when the id is already claimed', async () => {
		insertQueue.push([]); // claim insert → empty = already processed
		await handleWhatsAppMessage({ from: '+34600', id: 'dup-1', type: 'text', text: { body: 'Sí' } });
		expect(dbMock.select).not.toHaveBeenCalled(); // never reached the contact lookup
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('processes a message whose id is new', async () => {
		insertQueue.push([{ messageId: 'new-1' }]); // claim insert → new
		queueSelects([]); // contact lookup → unregistered (stops early, enough to prove flow ran)
		await handleWhatsAppMessage({ from: '+34699', id: 'new-1', type: 'text', text: { body: 'hola' } });
		expect(dbMock.select).toHaveBeenCalled();
		expect(repliesText()).toMatch(/no está autorizado/i);
	});
});

describe('authorisation gate', () => {
	it('rejects an unregistered phone number and does no further work', async () => {
		queueSelects([]); // contact lookup → empty
		await handleWhatsAppMessage({ from: '+34699', id: 'm1', type: 'text', text: { body: 'hola' } });
		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(repliesText()).toMatch(/no está autorizado/i);
		expect(dbMock.update).not.toHaveBeenCalled();
	});

	it('stays quiet when the same unknown number messages again inside the cooldown (issue #322)', async () => {
		rateLimitMock.mockResolvedValue(false); // cooldown already spent for this number
		queueSelects([]);
		await handleWhatsAppMessage({ from: '+34699', id: 'm2', type: 'text', text: { body: 'hola?' } });
		expect(sendMock).not.toHaveBeenCalled();
		// Keyed per sender, so one spammer can't silence a different number.
		expect(rateLimitMock).toHaveBeenCalledWith('whatsapp-unauth:+34699', 1, expect.any(Number));
	});
});

describe('pairing-code enrolment (issue #320)', () => {
	const RESTAURANT = [{ name: 'Casa Lua' }];

	it('enrols an unauthorised number that messages a valid code', async () => {
		redeemMock.mockResolvedValue({ ok: true, restaurantId: 'rest-1' });
		queueSelects([], RESTAURANT); // no contact yet, then the restaurant name lookup
		await handleWhatsAppMessage({ from: '+34699', id: 'm1', type: 'text', text: { body: 'A2B3C4' } });

		expect(redeemMock).toHaveBeenCalledWith('+34699', 'A2B3C4');
		// Confirmed in-chat, naming the venue so the chef knows it worked.
		expect(repliesText()).toMatch(/Número autorizado/i);
		expect(repliesText()).toContain('Casa Lua');
	});

	it('answers unknown, expired and used codes with one indistinguishable message', async () => {
		redeemMock.mockResolvedValue({ ok: false, reason: 'invalid' });
		queueSelects([]);
		await handleWhatsAppMessage({ from: '+34699', id: 'm1', type: 'text', text: { body: 'A2B3C4' } });
		// Nothing here reveals whether the code exists.
		expect(repliesText()).toMatch(/no es válido o ha caducado/i);
	});

	it('says nothing at all once the sender has burned its attempt budget', async () => {
		// "Too many attempts" is itself a signal, and every reply to an
		// unauthenticated number is billable traffic on our account.
		redeemMock.mockResolvedValue({ ok: false, reason: 'rateLimited' });
		queueSelects([]);
		await handleWhatsAppMessage({ from: '+34699', id: 'm1', type: 'text', text: { body: 'A2B3C4' } });
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('answers a cross-tenant conflict without confirming the number is registered elsewhere', async () => {
		redeemMock.mockResolvedValue({ ok: false, reason: 'taken' });
		queueSelects([]);
		await handleWhatsAppMessage({ from: '+34699', id: 'm1', type: 'text', text: { body: 'A2B3C4' } });
		// Generic — never names "another location" or confirms the number exists.
		expect(repliesText()).toMatch(/no se ha podido vincular este número/i);
		expect(repliesText()).not.toMatch(/otro local/i);
	});

	it('leaves ordinary chat from an unknown number on the "no autorizado" path', async () => {
		queueSelects([]);
		await handleWhatsAppMessage({ from: '+34699', id: 'm1', type: 'text', text: { body: 'buenas, soy Ana' } });
		expect(redeemMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/no está autorizado/i);
	});

	it('never treats an authorised sender\'s text as a code', async () => {
		// Redemption sits inside the unauthorised branch precisely so a
		// code-shaped message from a known number can't be hijacked. From a
		// known number the text goes to the review-reply parser instead.
		queueSelects(CONTACT);
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'text', text: { body: 'A2B3C4' } });
		expect(redeemMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/responde OK \/ NO/i);
	});

	it('does not treat media from an unknown number as a pairing attempt', async () => {
		queueSelects([]);
		await handleWhatsAppMessage({ from: '+34699', id: 'm1', type: 'image', image: { id: 'media-1' } });
		expect(redeemMock).not.toHaveBeenCalled();
		expect(downloadMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/no está autorizado/i);
	});
});

describe('message type routing (authorised contact)', () => {
	it('rejects an unsupported message type with a usage hint', async () => {
		queueSelects(CONTACT);
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'audio' });
		expect(repliesText()).toMatch(/Solo puedo procesar imágenes/i);
		expect(downloadMock).not.toHaveBeenCalled();
	});

	it('answers chat from an authorised contact with what it can actually do', async () => {
		queueSelects(CONTACT);
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'text', text: { body: 'hola' } });
		expect(repliesText()).toMatch(/Envíame una foto o PDF/i);
	});
});
