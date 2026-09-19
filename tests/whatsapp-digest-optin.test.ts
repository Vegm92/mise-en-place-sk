/**
 * Issue #331 — inbound opt-in / opt-out keywords for the WhatsApp digest push.
 *
 * Sending an invoice is not consent (out of scope: the enrolment/pairing flow
 * itself is untouched). Consent is a separate flag, flipped only by the
 * contact themselves texting a keyword, in Spanish or English, and it must
 * take effect immediately so a later send honours it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { setDigestOptInMock } = vi.hoisted(() => ({ setDigestOptInMock: vi.fn().mockResolvedValue(undefined) }));

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

const CONTACT = [{ restaurantId: 'rest-1' }];

vi.mock('$lib/server/db', () => ({
	db: { select: vi.fn(() => chain(CONTACT)) },
	runAsSystem: (fn: () => unknown) => fn(),
	runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../src/lib/server/idempotency', () => ({
	WHATSAPP_SCOPE: 'whatsapp',
	claimIdempotencyKey: vi.fn().mockResolvedValue(true),
	releaseIdempotencyKey: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/lib/server/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('../src/lib/server/billing', () => ({
	getAccessState: vi.fn().mockResolvedValue({ allowed: true, trialExpired: false }),
	ORPHAN_SUBSCRIPTIONS_QUEUE: 'scheduled-orphan-subscriptions',
	ORPHAN_SUBSCRIPTIONS_CRON: '50 3 * * *',
	runOrphanSubscriptionsJob: vi.fn(),
}));
vi.mock('../src/lib/server/whatsapp-contacts', () => ({ setDigestOptIn: setDigestOptInMock }));

import { handleInboundMessage } from '../src/lib/server/integrations/whatsapp/message-handler';
import type { WhatsAppMessageContext } from '../src/lib/server/integrations/whatsapp/transport';

function fakeTransport() {
	const sent: string[] = [];
	const ctx: WhatsAppMessageContext = {
		sendText: async (_to, body) => { sent.push(body); },
		downloadMedia: async () => ({ buffer: Buffer.alloc(0), extension: 'jpg' }),
	};
	return { ctx, sent };
}

function reply(body: string) {
	return { from: '34600111222', id: `m-${body}`, type: 'text' as const, text: { body } };
}

beforeEach(() => {
	vi.clearAllMocks();
	setDigestOptInMock.mockResolvedValue(undefined);
});

describe.each([
	['suscribir', 'Spanish'],
	['subscribe', 'English'],
	['SUSCRIBIR', 'Spanish, uppercase'],
])('opt-in keyword %j (%s), exact match only', (keyword) => {
	it('records opt-in and confirms', async () => {
		const { ctx, sent } = fakeTransport();
		await handleInboundMessage(reply(keyword), ctx);

		expect(setDigestOptInMock).toHaveBeenCalledWith('rest-1', '34600111222', true);
		expect(sent).toHaveLength(1);
		expect(sent[0]).not.toMatch(/factura/i);
	});
});

describe.each([
	['baja', 'Spanish'],
	['stop', 'English'],
	['UNSUBSCRIBE', 'English, uppercase'],
	['BAJA por favor', 'Spanish, extra words'],
	['quiero darme de baja', 'Spanish, embedded mid-sentence'],
	['please stop', 'English, extra words'],
])('opt-out keyword %j (%s), whole word anywhere in the message', (keyword) => {
	it('records opt-out and confirms', async () => {
		const { ctx, sent } = fakeTransport();
		await handleInboundMessage(reply(keyword), ctx);

		expect(setDigestOptInMock).toHaveBeenCalledWith('rest-1', '34600111222', false);
		expect(sent).toHaveLength(1);
		expect(sent[0]).not.toMatch(/factura/i);
	});
});

it('does not opt out on a word that only contains an opt-out keyword as a substring', async () => {
	const { ctx } = fakeTransport();
	await handleInboundMessage(reply('el camion no hizo parada nonstop'), ctx);
	expect(setDigestOptInMock).not.toHaveBeenCalled();
});

it('does not opt in when the opt-in word is only part of a longer message (opt-in stays exact-match)', async () => {
	const { ctx } = fakeTransport();
	await handleInboundMessage(reply('quiero suscribir mi otro numero tambien'), ctx);
	expect(setDigestOptInMock).not.toHaveBeenCalled();
});

it('leaves ordinary chat alone', async () => {
	const { ctx, sent } = fakeTransport();
	await handleInboundMessage(reply('buenas, tengo una duda'), ctx);
	expect(setDigestOptInMock).not.toHaveBeenCalled();
	expect(sent.join('\n')).toMatch(/Envíame una foto o PDF/i);
});
