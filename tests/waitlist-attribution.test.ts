/**
 * insertWaitlistEmail — attribution persistence (issue #326).
 *
 * DB-backed: a real Postgres row is inserted and read back, so the
 * onConflictDoNothing() semantics (re-submit stays a no-op, original
 * attribution is never overwritten) are proven against actual constraint
 * behaviour, not a mock. Skipped without DATABASE_URL/DATABASE_TEST_URL.
 */
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { hasDbEnv, testSql, closeDb } from './helpers/test-db';
import type { Attribution } from '../src/lib/attribution';

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	return { db: testDb };
});

import { insertWaitlistEmail } from '../src/lib/server/waitlist-db';

const describeDb = hasDbEnv ? describe : describe.skip;

const PREFIX = 'test-vitest-attr-';

function uniqueEmail(suffix: string): string {
	return `${PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const FULL_ATTRIBUTION: Attribution = {
	source: 'google',
	campaign: 'spring_launch',
	variant: 'b',
	segment: 'chefs',
	referrer: 'https://google.com/search',
	landingPath: '/waitlist',
	referredBy: 'ABC123',
};

afterEach(async () => {
	if (hasDbEnv) await testSql`DELETE FROM waitlist WHERE email LIKE ${PREFIX + '%'}`;
});

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

describeDb('insertWaitlistEmail — attribution (issue #326)', () => {
	it('persists source + campaign (and the rest of the attribution) on the row', async () => {
		const email = uniqueEmail('full');
		const inserted = await insertWaitlistEmail(email, FULL_ATTRIBUTION);
		expect(inserted).toBe(true);

		const rows = await testSql`SELECT * FROM waitlist WHERE email = ${email}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].source).toBe('google');
		expect(rows[0].campaign).toBe('spring_launch');
		expect(rows[0].variant).toBe('b');
		expect(rows[0].segment).toBe('chefs');
		expect(rows[0].referrer).toBe('https://google.com/search');
		expect(rows[0].landing_path).toBe('/waitlist');
		expect(rows[0].referred_by).toBe('ABC123');
	});

	it('stores null attribution columns when no attribution is passed', async () => {
		const email = uniqueEmail('bare');
		const inserted = await insertWaitlistEmail(email);
		expect(inserted).toBe(true);

		const rows = await testSql`SELECT * FROM waitlist WHERE email = ${email}`;
		expect(rows[0].source).toBeNull();
		expect(rows[0].campaign).toBeNull();
	});

	it('returns false for an already-registered email and does not overwrite the original attribution', async () => {
		const email = uniqueEmail('dup');
		expect(await insertWaitlistEmail(email, FULL_ATTRIBUTION)).toBe(true);

		const secondAttempt = await insertWaitlistEmail(email, {
			source: 'facebook',
			campaign: 'retarget',
			variant: 'z',
			segment: 'owners',
			referrer: 'https://facebook.com/',
			landingPath: '/waitlist',
			referredBy: 'ZZZ999',
		});
		expect(secondAttempt).toBe(false);

		const rows = await testSql`SELECT * FROM waitlist WHERE email = ${email}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].source).toBe('google');
		expect(rows[0].campaign).toBe('spring_launch');
		expect(rows[0].referred_by).toBe('ABC123');
	});
});
