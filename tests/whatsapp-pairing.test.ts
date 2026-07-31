/**
 * WhatsApp enrolment by pairing code (issue #320).
 *
 * Redemption runs before the bot's authorisation gate — an enrolling number is
 * by definition not yet authorised — which makes it the one unauthenticated
 * write path into `whatsapp_contacts`. These tests pin the properties that keep
 * that narrow: single use, expiry, per-sender rate limiting, failures that are
 * indistinguishable from one another, and a clean loss when the number already
 * belongs to another tenant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, addContactMock, rateLimitMock, updateReturning, insertReturning, selectRows, updatedValues } = vi.hoisted(() => {
	const updateReturning: unknown[][] = [];
	const insertReturning: unknown[][] = [];
	const selectRows: unknown[][] = [];
	const updatedValues: Record<string, unknown>[] = [];

	function chain(result: unknown, capture?: (v: Record<string, unknown>) => void) {
		const c: unknown = new Proxy({}, {
			get(_t, prop) {
				if (prop === 'then') {
					return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
						Promise.resolve(result).then(res, rej);
				}
				if (typeof prop === 'symbol') return undefined;
				if (prop === 'set' && capture) return (v: Record<string, unknown>) => { capture(v); return c; };
				return () => c;
			},
		});
		return c;
	}

	return {
		updateReturning,
		insertReturning,
		selectRows,
		updatedValues,
		dbMock: {
			update: vi.fn(() => chain(
				updateReturning.length ? updateReturning.shift() : [],
				(v) => updatedValues.push(v),
			)),
			insert: vi.fn(() => chain(insertReturning.length ? insertReturning.shift() : [])),
			select: vi.fn(() => chain(selectRows.length ? selectRows.shift() : [])),
		},
		addContactMock: vi.fn().mockResolvedValue({ ok: true }),
		rateLimitMock: vi.fn().mockResolvedValue(true),
	};
});

vi.mock('../src/lib/server/db', async () => {
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: dbMock, forTenant };
});
vi.mock('../src/lib/server/whatsapp-contacts', () => ({ addContact: addContactMock }));
vi.mock('../src/lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));

import {
	generatePairingCode,
	normalizeCode,
	redeemPairingCode,
} from '../src/lib/server/whatsapp-pairing';

const RESTAURANT_A = '11111111-1111-1111-1111-111111111111';
const USER = 'user-1';
const PHONE = '34612345678';

beforeEach(() => {
	vi.clearAllMocks();
	updateReturning.length = 0;
	insertReturning.length = 0;
	selectRows.length = 0;
	updatedValues.length = 0;
	addContactMock.mockResolvedValue({ ok: true });
	rateLimitMock.mockResolvedValue(true);
});

describe('normalizeCode', () => {
	it('accepts what a phone keyboard actually produces', () => {
		// Lowercase, spaces and dashes are all things people type; none of them
		// should be the reason a chef fails to enrol.
		expect(normalizeCode('a2b3c4')).toBe('A2B3C4');
		expect(normalizeCode('A2B 3C4')).toBe('A2B3C4');
		expect(normalizeCode(' a2b-3c4 ')).toBe('A2B3C4');
	});

	it('rejects anything that is not a six-character code', () => {
		expect(normalizeCode('A2B3C')).toBeNull();
		expect(normalizeCode('A2B3C45')).toBeNull();
		expect(normalizeCode('')).toBeNull();
	});

	it('rejects codes using characters outside the alphabet', () => {
		// 0/O, 1/I/L and 5/S are excluded to keep the code unambiguous when read
		// off a screen — treating "SI0LO1" as a code attempt would also drag
		// ordinary chat into the redemption rate limiter.
		expect(normalizeCode('SI0LO1')).toBeNull();
		expect(normalizeCode('ABCDEO')).toBeNull();
	});
});

describe('generatePairingCode', () => {
	it('mints a code from the unambiguous alphabet and returns an expiry', async () => {
		insertReturning.push([{ code: 'A2B3C4', expiresAt: new Date('2026-07-27T10:15:00Z') }]);
		const result = await generatePairingCode(RESTAURANT_A, USER, 'Chef García');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.pairing.code).toBe('A2B3C4');
		expect(result.pairing.displayName).toBe('Chef García');
	});

	it('expires any outstanding code before minting a replacement', async () => {
		insertReturning.push([{ code: 'A2B3C4', expiresAt: new Date() }]);
		await generatePairingCode(RESTAURANT_A, USER, null);

		// One live code per tenant: a second one silently superseding the one
		// already written on a notepad would be worse than reissuing visibly.
		expect(dbMock.update).toHaveBeenCalled();
		expect((updatedValues[0].expiresAt as Date).getTime()).toBe(0);
	});

	it('refuses when the owner has minted too many codes', async () => {
		rateLimitMock.mockResolvedValue(false);
		const result = await generatePairingCode(RESTAURANT_A, USER, null);
		expect(result).toEqual({ ok: false, reason: 'rateLimited' });
		expect(dbMock.insert).not.toHaveBeenCalled();
	});
});

describe('redeemPairingCode', () => {
	it('binds the sending number to the code\'s restaurant', async () => {
		updateReturning.push([{ id: 1, restaurantId: RESTAURANT_A, displayName: 'Chef García' }]);
		const result = await redeemPairingCode(PHONE, 'A2B3C4');

		expect(result).toEqual({ ok: true, restaurantId: RESTAURANT_A });
		// The number comes from the webhook, never from anything anyone typed.
		expect(addContactMock).toHaveBeenCalledWith(RESTAURANT_A, PHONE, 'Chef García');
	});

	it('reports unknown, expired and already-used codes identically', async () => {
		// The guarded UPDATE returns nothing for all three, and the caller must
		// not be able to tell them apart — otherwise a guess leaks existence.
		updateReturning.push([]);
		expect(await redeemPairingCode(PHONE, 'A2B3C4')).toEqual({ ok: false, reason: 'invalid' });
		expect(addContactMock).not.toHaveBeenCalled();
	});

	it('never touches the database for a malformed code', async () => {
		expect(await redeemPairingCode(PHONE, 'hola que tal')).toEqual({ ok: false, reason: 'invalid' });
		expect(dbMock.update).not.toHaveBeenCalled();
		// …and does not spend an attempt, so chatting to the bot cannot lock a
		// genuine staff member out of enrolling.
		expect(rateLimitMock).not.toHaveBeenCalled();
	});

	it('rate-limits redemption attempts per sender', async () => {
		rateLimitMock.mockResolvedValue(false);
		expect(await redeemPairingCode(PHONE, 'A2B3C4')).toEqual({ ok: false, reason: 'rateLimited' });
		expect(dbMock.update).not.toHaveBeenCalled();
		expect(rateLimitMock).toHaveBeenCalledWith(`whatsapp-pair:${PHONE}`, expect.any(Number), expect.any(Number));
	});

	it('releases the code when the number belongs to another restaurant', async () => {
		updateReturning.push([{ id: 7, restaurantId: RESTAURANT_A, displayName: null }]); // claim
		addContactMock.mockResolvedValue({ ok: false, reason: 'taken' });

		expect(await redeemPairingCode(PHONE, 'A2B3C4')).toEqual({ ok: false, reason: 'taken' });

		// Nothing was enrolled, so the owner's single-use code must not be spent.
		expect(updatedValues.at(-1)).toEqual({ redeemedAt: null, redeemedBy: null });
	});

	it('claims the code with a guarded update, so two deliveries cannot both win', async () => {
		updateReturning.push([{ id: 1, restaurantId: RESTAURANT_A, displayName: null }]);
		updateReturning.push([]); // the redelivery finds nothing left to claim

		expect((await redeemPairingCode(PHONE, 'A2B3C4')).ok).toBe(true);
		expect((await redeemPairingCode(PHONE, 'A2B3C4')).ok).toBe(false);
		expect(addContactMock).toHaveBeenCalledTimes(1);
	});
});
