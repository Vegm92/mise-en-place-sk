/**
 * WhatsApp invoice bot — message routing & confirmation state machine (feat #108).
 *
 * The bot is the conversational layer over extraction: it authorises the sending
 * number, routes media vs. text, and runs a SÍ/NO confirmation handshake before
 * persisting. These tests pin that control flow — authorisation gate, type
 * routing, accent-insensitive yes/no parsing, and the pending-session guards —
 * with the db and side-effecting modules (whatsapp send, extraction, storage)
 * mocked. The real dedup module is kept (pure).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, sendMock, downloadMock, extractMock, saveMock, claimMock, releaseMock, selectQueue, insertQueue } = vi.hoisted(() => {
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
		transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
			fn({ select: () => chain([]), insert: () => chain([{ id: 1 }]) }),
		),
	};

	return {
		dbMock,
		sendMock: vi.fn().mockResolvedValue(undefined),
		downloadMock: vi.fn(),
		extractMock: vi.fn(),
		saveMock: vi.fn().mockResolvedValue(undefined),
		// Quota gate defaults to "slot granted" so the existing flows are unaffected.
		claimMock: vi.fn().mockResolvedValue({ claimed: true }),
		releaseMock: vi.fn().mockResolvedValue(undefined),
		selectQueue,
		insertQueue,
	};
});

vi.mock('../src/lib/server/db', () => ({ db: dbMock }));
vi.mock('../src/lib/server/whatsapp', () => ({
	sendWhatsAppMessage: sendMock,
	downloadWhatsAppMedia: downloadMock,
}));
vi.mock('../src/lib/server/extract', () => ({ extractWithProvider: extractMock }));
vi.mock('../src/lib/server/storage', () => ({ getStorage: () => ({ save: saveMock }) }));
vi.mock('../src/lib/server/llm-quota', () => ({
	claimMonthlyExtraction: claimMock,
	releaseMonthlyExtraction: releaseMock,
}));
vi.mock('@sentry/sveltekit', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { handleWhatsAppMessage } from '../src/lib/server/whatsapp-bot';

const CONTACT = [{ restaurantId: 'rest-1' }];
const SESSION = [{ id: 7, restaurantId: 'rest-1', fromNumber: '+34600', status: 'awaiting_confirmation', extractedData: {}, fileKey: 'k' }];

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
	claimMock.mockResolvedValue({ claimed: true });
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
});

describe('message type routing (authorised contact)', () => {
	it('rejects an unsupported message type with a usage hint', async () => {
		queueSelects(CONTACT);
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'audio' });
		expect(repliesText()).toMatch(/Solo puedo procesar imágenes/i);
		expect(downloadMock).not.toHaveBeenCalled();
	});

	it('blocks a new media upload while a confirmation is already pending', async () => {
		queueSelects(CONTACT, SESSION); // contact, then pending-session lookup
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });
		expect(repliesText()).toMatch(/factura pendiente de confirmación/i);
		// Guarded before any download/extraction happens.
		expect(downloadMock).not.toHaveBeenCalled();
		expect(extractMock).not.toHaveBeenCalled();
		// …and before the quota claim, so a rejected duplicate never burns a slot.
		expect(claimMock).not.toHaveBeenCalled();
	});
});

describe('plan quota gate (issue #318)', () => {
	/** Drive a media upload from an authorised contact with no pending session. */
	async function sendImage() {
		queueSelects(CONTACT, []); // contact, then no pending session
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'image', image: { id: 'media-1' } });
	}

	it('refuses to extract once the monthly plan quota is exhausted', async () => {
		claimMock.mockResolvedValue({ claimed: false, reason: 'monthly_plan_limit', limit: 50 });
		await sendImage();

		// The whole point: no Gemini spend on a tenant that is over its cap.
		expect(extractMock).not.toHaveBeenCalled();
		expect(downloadMock).not.toHaveBeenCalled();
		// The sender gets a clear answer rather than silence, naming the limit.
		expect(repliesText()).toMatch(/límite de facturas de tu plan/i);
		expect(repliesText()).toContain('50');
		// Nothing was claimed, so nothing to give back.
		expect(releaseMock).not.toHaveBeenCalled();
	});

	it('claims a slot before extracting and keeps it when extraction succeeds', async () => {
		downloadMock.mockResolvedValue({ buffer: Buffer.from('img'), extension: 'jpg' });
		extractMock.mockResolvedValue({ invoice: { supplier_name: 'Frutas Paco', total_amount: 42 } });
		await sendImage();

		expect(claimMock).toHaveBeenCalledWith('rest-1');
		expect(extractMock).toHaveBeenCalled();
		expect(releaseMock).not.toHaveBeenCalled();
		expect(repliesText()).toMatch(/Frutas Paco/);
	});

	it('releases the slot when extraction fails', async () => {
		downloadMock.mockResolvedValue({ buffer: Buffer.from('img'), extension: 'jpg' });
		extractMock.mockRejectedValue(new Error('gemini exploded'));
		await sendImage();

		expect(releaseMock).toHaveBeenCalledWith('rest-1');
		expect(repliesText()).toMatch(/No he podido leer la factura/i);
	});

	it('releases the slot when the media download fails', async () => {
		downloadMock.mockRejectedValue(new Error('404 from Meta'));
		await sendImage();

		expect(releaseMock).toHaveBeenCalledWith('rest-1');
		expect(extractMock).not.toHaveBeenCalled();
	});
});

describe('SÍ/NO confirmation handshake', () => {
	it('treats accented "sí" as yes (no pending session → tells user nothing is pending)', async () => {
		queueSelects(CONTACT, []); // contact, then no pending session
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'text', text: { body: 'Sí' } });
		expect(repliesText()).toMatch(/No hay ninguna factura pendiente/i);
	});

	it('discards the pending invoice on "no"', async () => {
		queueSelects(CONTACT, SESSION);
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'text', text: { body: 'NO' } });
		expect(dbMock.update).toHaveBeenCalled(); // status → discarded
		expect(repliesText()).toMatch(/descartada/i);
	});

	it('re-prompts when a pending session gets an unrecognised reply', async () => {
		queueSelects(CONTACT, SESSION);
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'text', text: { body: 'tal vez' } });
		expect(repliesText()).toMatch(/responde \*SÍ\*/i);
		expect(dbMock.update).not.toHaveBeenCalled();
	});

	it('stays silent on chit-chat when nothing is pending', async () => {
		queueSelects(CONTACT, []); // contact, no pending session
		await handleWhatsAppMessage({ from: '+34600', id: 'm1', type: 'text', text: { body: 'buenos días' } });
		expect(sendMock).not.toHaveBeenCalled();
	});
});
