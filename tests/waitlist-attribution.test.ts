/**
 * insertWaitlistEmail — attribution persistence (issue #326).
 *
 * DB-backed: a real Postgres row is inserted and read back, so the
 * onConflictDoNothing() semantics (re-submit stays a no-op, original
 * attribution is never overwritten) are proven against actual constraint
 * behaviour, not a mock. Skipped without DATABASE_URL/DATABASE_TEST_URL.
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { hasDbEnv, testSql, closeDb } from './helpers/test-db';
import type { Attribution } from '../src/lib/attribution';

import {
	insertWaitlistEmail,
	generateReferralCode,
	getReferralCode,
	resolveReferralOwnerEmail,
} from '../src/lib/server/waitlist-db';

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

function assertFullAttribution(row: Record<string, unknown>) {
	expect(row.source).toBe('google');
	expect(row.campaign).toBe('spring_launch');
	expect(row.variant).toBe('b');
	expect(row.segment).toBe('chefs');
	expect(row.referrer).toBe('https://google.com/search');
	expect(row.landing_path).toBe('/waitlist');
	expect(row.referred_by).toBe('ABC123');
}

describeDb('insertWaitlistEmail — attribution (issue #326)', () => {
	it('persists source + campaign (and the rest of the attribution) on the row', async () => {
		const email = uniqueEmail('full');
		const inserted = await insertWaitlistEmail(email, FULL_ATTRIBUTION);
		expect(inserted).toBe(true);

		const rows = await testSql`SELECT * FROM waitlist WHERE email = ${email}`;
		expect(rows).toHaveLength(1);
		expect(rows[0]!.source).toBe('google');
		expect(rows[0]!.campaign).toBe('spring_launch');
		expect(rows[0]!.variant).toBe('b');
		expect(rows[0]!.segment).toBe('chefs');
		expect(rows[0]!.referrer).toBe('https://google.com/search');
		expect(rows[0]!.landing_path).toBe('/waitlist');
		expect(rows[0]!.referred_by).toBe('ABC123');
	});

	it('stores null attribution columns when no attribution is passed', async () => {
		const email = uniqueEmail('bare');
		const inserted = await insertWaitlistEmail(email);
		expect(inserted).toBe(true);

		const rows = await testSql`SELECT * FROM waitlist WHERE email = ${email}`;
		expect(rows[0]!.source).toBeNull();
		expect(rows[0]!.campaign).toBeNull();
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
		expect(rows[0]!.source).toBe('google');
		expect(rows[0]!.campaign).toBe('spring_launch');
		expect(rows[0]!.referred_by).toBe('ABC123');
	});
});

describeDb('waitlist referral codes (issue #332)', () => {
	it('assigns each row its own code, unrelated to its email or row id', async () => {
		const emailA = uniqueEmail('ref-a');
		const emailB = uniqueEmail('ref-b');
		await insertWaitlistEmail(emailA);
		await insertWaitlistEmail(emailB);

		const codeA = await getReferralCode(emailA);
		const codeB = await getReferralCode(emailB);

		expect(codeA).toBeTruthy();
		expect(codeB).toBeTruthy();
		expect(codeA).not.toBe(codeB);
		expect(codeA).toMatch(/^[A-Za-z0-9_-]{10,}$/);
		expect(codeA!.toLowerCase()).not.toContain(emailA.split('@')[0]!.toLowerCase());
	});

	it('resolves the owning email for a real code and null for an unknown one', async () => {
		const email = uniqueEmail('owner');
		await insertWaitlistEmail(email);
		const code = await getReferralCode(email);
		expect(code).toBeTruthy();

		expect(await resolveReferralOwnerEmail(code!)).toBe(email);
		expect(await resolveReferralOwnerEmail('not-a-real-code')).toBeNull();
		expect(await getReferralCode(uniqueEmail('missing'))).toBeNull();
	});

	it('cannot be enumerated by guessing sequential ids or values derived from the email', async () => {
		const email = uniqueEmail('enum-target');
		await insertWaitlistEmail(email);
		const rows = await testSql`SELECT id, referral_code FROM waitlist WHERE email = ${email}`;
		const realId = Number(rows[0]!.id);
		const realCode = String(rows[0]!.referral_code);

		const guesses = [
			String(realId),
			realId.toString(36),
			Buffer.from(String(realId)).toString('base64url'),
			Buffer.from(email).toString('base64url'),
			'AAAAAAAAAAAA',
			'000000000000',
		];

		for (const guess of guesses) {
			expect(guess).not.toBe(realCode);
			expect(await resolveReferralOwnerEmail(guess)).toBeNull();
		}
	});

	it('generateReferralCode produces unique, high-entropy values', () => {
		const codes = Array.from({ length: 50 }, () => generateReferralCode());
		expect(new Set(codes).size).toBe(codes.length);
		for (const code of codes) expect(code.length).toBeGreaterThanOrEqual(10);
	});

	it('backfills a code for a pre-existing row that has none, and persists it', async () => {
		const email = uniqueEmail('pre-0084');
		await testSql`INSERT INTO waitlist (email, referral_code) VALUES (${email}, NULL)`;

		const before = await testSql`SELECT referral_code FROM waitlist WHERE email = ${email}`;
		expect(before[0]!.referral_code).toBeNull();

		const backfilled = await getReferralCode(email);
		expect(backfilled).toBeTruthy();

		const after = await testSql`SELECT referral_code FROM waitlist WHERE email = ${email}`;
		expect(after[0]!.referral_code).toBe(backfilled);
		expect(await getReferralCode(email)).toBe(backfilled);
	});
});
