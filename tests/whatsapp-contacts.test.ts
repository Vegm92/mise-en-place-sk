/**
 * WhatsApp allow-list — phone normalisation and contact management.
 *
 * The bot resolves the tenant by matching the webhook's `from` field against
 * `whatsapp_contacts.phone_number`, so normalisation is load-bearing: a number
 * stored in any other shape than E.164-without-'+' silently never matches and
 * the sender is told they are "not authorised". These tests pin that format,
 * plus the global-uniqueness behaviour that stops one tenant from stealing a
 * number already authorised at another.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatPhoneNumber, normalizePhoneNumber } from '../src/lib/phone';

const { dbMock, insertReturning, selectRows, deleteReturning, insertedValues, trackEventMock } = vi.hoisted(() => {
	const insertReturning: unknown[][] = [];
	const selectRows: unknown[][] = [];
	const deleteReturning: unknown[][] = [];
	// Every payload passed to .values(), so tests can assert what got stored.
	const insertedValues: Record<string, unknown>[] = [];

	// Chainable thenable stub: every method returns itself, awaiting resolves.
	function chain(result: unknown) {
		const c: unknown = new Proxy({}, {
			get(_t, prop) {
				if (prop === 'then') {
					return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
						Promise.resolve(result).then(res, rej);
				}
				if (typeof prop === 'symbol') return undefined;
				if (prop === 'values') {
					return (v: Record<string, unknown>) => { insertedValues.push(v); return c; };
				}
				return () => c;
			},
		});
		return c;
	}

	return {
		insertReturning,
		selectRows,
		deleteReturning,
		insertedValues,
		trackEventMock: vi.fn(),
		dbMock: {
			insert: vi.fn(() => chain(insertReturning.length ? insertReturning.shift() : [])),
			select: vi.fn(() => chain(selectRows.length ? selectRows.shift() : [])),
			delete: vi.fn(() => chain(deleteReturning.length ? deleteReturning.shift() : [{ id: 1, restaurantId: '11111111-1111-1111-1111-111111111111', phoneNumber: '34612345678' }])),
		},
	};
});

vi.mock('../src/lib/server/db', async () => {
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: dbMock, forTenant };
});
vi.mock('../src/lib/server/events', () => ({ trackEvent: trackEventMock }));

const RESTAURANT_A = '11111111-1111-1111-1111-111111111111';
const RESTAURANT_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
	insertReturning.length = 0;
	selectRows.length = 0;
	deleteReturning.length = 0;
	insertedValues.length = 0;
	vi.clearAllMocks();
});

describe('normalizePhoneNumber', () => {
	it('strips formatting from an international number', () => {
		expect(normalizePhoneNumber('+34 612 345 678')).toEqual({ ok: true, phone: '34612345678' });
	});

	it('accepts the digits-only form the webhook itself delivers', () => {
		expect(normalizePhoneNumber('34612345678')).toEqual({ ok: true, phone: '34612345678' });
	});

	it('completes a bare Spanish national number with the country code', () => {
		expect(normalizePhoneNumber('612 345 678')).toEqual({ ok: true, phone: '34612345678' });
	});

	it('strips a written-out 00 international prefix', () => {
		expect(normalizePhoneNumber('0034-612-345-678')).toEqual({ ok: true, phone: '34612345678' });
	});

	it('normalises every written form of one number to the same string', () => {
		const forms = ['+34 612 345 678', '0034612345678', '612345678', '(+34) 612.345.678'];
		const results = forms.map(f => normalizePhoneNumber(f));
		expect(results.every(r => r.ok && r.phone === '34612345678')).toBe(true);
	});

	it('rejects empty input', () => {
		expect(normalizePhoneNumber('')).toEqual({ ok: false, reason: 'empty' });
		expect(normalizePhoneNumber('   ')).toEqual({ ok: false, reason: 'empty' });
	});

	it('rejects numbers that are too short or beyond E.164 length', () => {
		expect(normalizePhoneNumber('12345')).toEqual({ ok: false, reason: 'tooShort' });
		expect(normalizePhoneNumber('1234567890123456')).toEqual({ ok: false, reason: 'tooLong' });
	});
});

describe('formatPhoneNumber', () => {
	it('renders a Spanish number in readable groups', () => {
		expect(formatPhoneNumber('34612345678')).toBe('+34 612 345 678');
	});

	it('falls back to a plain +prefix for other countries', () => {
		expect(formatPhoneNumber('351912345678')).toBe('+351912345678');
	});

	it('round-trips with normalize', () => {
		const formatted = formatPhoneNumber('34612345678');
		expect(normalizePhoneNumber(formatted)).toEqual({ ok: true, phone: '34612345678' });
	});
});

describe('addContact', () => {
	it('stores the normalised number, not the raw input', async () => {
		const { addContact } = await import('../src/lib/server/whatsapp-contacts');
		insertReturning.push([{ id: 1 }]);

		const result = await addContact(RESTAURANT_A, '+34 612 345 678', 'Chef García');

		expect(result).toEqual({ ok: true });
		// The stored value must match the webhook's `from` field byte for byte.
		expect(insertedValues[0]).toEqual({
			restaurantId: RESTAURANT_A,
			phoneNumber: '34612345678',
			displayName: 'Chef García',
		});
	});

	it('rejects an invalid number before touching the database', async () => {
		const { addContact } = await import('../src/lib/server/whatsapp-contacts');

		expect(await addContact(RESTAURANT_A, 'not a phone', null)).toEqual({ ok: false, reason: 'invalid' });
		expect(dbMock.insert).not.toHaveBeenCalled();
	});

	it('is idempotent when the number already belongs to this restaurant', async () => {
		const { addContact } = await import('../src/lib/server/whatsapp-contacts');
		insertReturning.push([]);                              // conflict: nothing inserted
		selectRows.push([{ restaurantId: RESTAURANT_A }]);     // …and it's ours

		expect(await addContact(RESTAURANT_A, '612345678', null)).toEqual({ ok: true });
	});

	it('refuses a number already authorised at another restaurant', async () => {
		const { addContact } = await import('../src/lib/server/whatsapp-contacts');
		insertReturning.push([]);                              // conflict: nothing inserted
		selectRows.push([{ restaurantId: RESTAURANT_B }]);     // …and it belongs to someone else

		expect(await addContact(RESTAURANT_A, '612345678', null)).toEqual({ ok: false, reason: 'taken' });
	});

	it('treats a blank display name as absent', async () => {
		const { addContact } = await import('../src/lib/server/whatsapp-contacts');
		insertReturning.push([{ id: 2 }]);

		expect(await addContact(RESTAURANT_A, '612345678', '   ')).toEqual({ ok: true });
		expect(insertedValues[0]!.displayName).toBeNull();
	});
});

describe('removeContact', () => {
	it('reports success when a row was deleted', async () => {
		const { removeContact } = await import('../src/lib/server/whatsapp-contacts');
		deleteReturning.push([{ id: 1, phoneNumber: '34612345678' }]);
		expect(await removeContact(RESTAURANT_A, 1, 'owner-user')).toBe(true);
		expect(dbMock.delete).toHaveBeenCalled();
	});

	it('writes an audit event so the release is traceable', async () => {
		const { removeContact } = await import('../src/lib/server/whatsapp-contacts');
		deleteReturning.push([{ id: 5, phoneNumber: '34612345678' }]);
		await removeContact(RESTAURANT_A, 5, 'owner-user');

		expect(trackEventMock).toHaveBeenCalledWith(
			'whatsapp_contact_released',
			RESTAURANT_A,
			expect.objectContaining({ contactId: 5, phoneNumber: '34612345678', releasedBy: 'owner-user', method: 'owner' }),
		);
	});

	it('reports failure and skips the audit event when nothing was deleted', async () => {
		const { removeContact } = await import('../src/lib/server/whatsapp-contacts');
		deleteReturning.push([]);
		expect(await removeContact(RESTAURANT_A, 999)).toBe(false);
		expect(trackEventMock).not.toHaveBeenCalled();
	});
});

describe('releaseContactByPhone', () => {
	it('deletes the contact wherever it lives and reports the freed tenant', async () => {
		const { releaseContactByPhone } = await import('../src/lib/server/whatsapp-contacts');
		deleteReturning.push([{ id: 9, restaurantId: RESTAURANT_B, phoneNumber: '34612345678' }]);

		const result = await releaseContactByPhone('+34 612 345 678', 'support@mise.dev');

		expect(result).toEqual({ ok: true, restaurantId: RESTAURANT_B });
		expect(trackEventMock).toHaveBeenCalledWith(
			'whatsapp_contact_released',
			RESTAURANT_B,
			expect.objectContaining({ contactId: 9, phoneNumber: '34612345678', releasedBy: 'support@mise.dev', method: 'support' }),
		);
	});

	it('frees the number for another tenant to bind via pairing', async () => {
		const { releaseContactByPhone } = await import('../src/lib/server/whatsapp-contacts');
		const { addContact } = await import('../src/lib/server/whatsapp-contacts');
		deleteReturning.push([{ id: 9, restaurantId: RESTAURANT_B, phoneNumber: '34612345678' }]);
		await releaseContactByPhone('34612345678', 'support@mise.dev');

		// Once released, the same number binds cleanly to a different tenant —
		// the earlier conflict is gone because the row no longer exists.
		insertReturning.push([{ id: 10 }]);
		expect(await addContact(RESTAURANT_A, '34612345678', null)).toEqual({ ok: true });
	});

	it('rejects an unparseable phone before touching the database', async () => {
		const { releaseContactByPhone } = await import('../src/lib/server/whatsapp-contacts');
		expect(await releaseContactByPhone('not a phone', 'support@mise.dev')).toEqual({ ok: false, reason: 'invalid' });
		expect(dbMock.delete).not.toHaveBeenCalled();
	});

	it('reports notFound and skips the audit event when the number is not bound anywhere', async () => {
		const { releaseContactByPhone } = await import('../src/lib/server/whatsapp-contacts');
		deleteReturning.push([]);
		expect(await releaseContactByPhone('34612345678', 'support@mise.dev')).toEqual({ ok: false, reason: 'notFound' });
		expect(trackEventMock).not.toHaveBeenCalled();
	});
});
