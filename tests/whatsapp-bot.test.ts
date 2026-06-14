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

const { dbMock, sendMock, downloadMock, extractMock, saveMock, selectQueue } = vi.hoisted(() => {
	const selectQueue: unknown[][] = [];

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
		update: vi.fn(() => chain([])),
		insert: vi.fn(() => chain([])),
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
		selectQueue,
	};
});

vi.mock('../src/lib/server/db', () => ({ db: dbMock }));
vi.mock('../src/lib/server/whatsapp', () => ({
	sendWhatsAppMessage: sendMock,
	downloadWhatsAppMedia: downloadMock,
}));
vi.mock('../src/lib/server/extract', () => ({ extractWithProvider: extractMock }));
vi.mock('../src/lib/server/storage', () => ({ getStorage: () => ({ save: saveMock }) }));

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
