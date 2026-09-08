/**
 * Signup + resend actions (issue #496).
 *
 * Two things must never happen: an unrate-limited primitive that mails an
 * address the caller merely typed, and a response shape that discloses
 * whether an email is already registered. `resend` must look up the
 * account and only mail an existing, still-unverified row; `signUp` must
 * respond identically whether the address is free, already verified, or
 * mid-signup (unverified) — and in the unverified case it re-sends the
 * verification email and lets the new attempt's password take over the
 * row, so the real mailbox owner can reclaim a squatted address.
 *
 * db, the rate limiter, consent recording, verification tokens, email and
 * Auth.js sign-in are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileFormData, maliciousFile } from './helpers/form-data';

const {
	rateLimitMock, logAuthEventMock, recordConsentMock,
	createVerificationTokenMock, sendEmailMock, signInMock,
	state, insertedRows, updatedRows,
} = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
	logAuthEventMock: vi.fn(),
	recordConsentMock: vi.fn().mockResolvedValue(undefined),
	createVerificationTokenMock: vi.fn().mockResolvedValue('tok123'),
	sendEmailMock: vi.fn().mockResolvedValue(undefined),
	signInMock: vi.fn(),
	state: {
		userRow: null as { id: string; emailVerified: Date | null } | null,
	},
	insertedRows: [] as Array<Record<string, unknown>>,
	updatedRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/auth-events', () => ({ logAuthEvent: logAuthEventMock, hashIp: () => 'iphash' }));
vi.mock('$lib/server/consent', () => ({ recordConsent: recordConsentMock }));
vi.mock('$lib/server/verification-token', () => ({ createVerificationToken: createVerificationTokenMock }));
vi.mock('$lib/server/email', () => ({
	sendEmail: sendEmailMock,
	verifyEmailAddress: (email: string, url: string) => ({ to: email, subject: 's', html: url }),
}));
vi.mock('$lib/server/auth', () => ({ signIn: signInMock }));
vi.mock('$lib/server/db', () => {
	const select = () => ({
		from: () => ({
			where: () => ({
				limit: () => Promise.resolve(state.userRow ? [state.userRow] : []),
			}),
		}),
	});
	const insert = () => ({
		values: (values: Record<string, unknown>) => ({
			returning: () => {
				const row = { id: 'new-user-id', emailVerified: null, ...values };
				insertedRows.push(row);
				return Promise.resolve([row]);
			},
		}),
	});
	const update = () => ({
		set: (values: Record<string, unknown>) => ({
			where: () => {
				updatedRows.push(values);
				return Promise.resolve([]);
			},
		}),
	});
	return { db: { select, insert, update } };
});

import { actions } from '../src/routes/signup/+page.server';

function signupEvent(fields: Record<string, string>, attrCookie?: string) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	return {
		request: { formData: async () => data },
		getClientAddress: () => '203.0.113.7',
		url: new URL('https://app.example.test/signup'),
		cookies: {
			get: (name: string) => (name === 'mep_attr' ? attrCookie : undefined),
			set: vi.fn(),
		},
	} as never;
}

function signupEventWithFile(fields: Record<string, string | File>) {
	return {
		request: { formData: async () => fileFormData(fields) },
		getClientAddress: () => '203.0.113.7',
		url: new URL('https://app.example.test/signup'),
		cookies: { get: () => undefined, set: vi.fn() },
	} as never;
}

const GOOD_SIGNUP = { email: 'chef@example.com', password: 'correct-horse-battery', terms: 'on' };

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
	logAuthEventMock.mockClear();
	recordConsentMock.mockClear().mockResolvedValue(undefined);
	createVerificationTokenMock.mockClear().mockResolvedValue('tok123');
	sendEmailMock.mockClear();
	signInMock.mockClear();
	state.userRow = null;
	insertedRows.length = 0;
	updatedRows.length = 0;
});

describe('signUp', () => {
	it('creates a new account and sends the verification email when the address is free', async () => {
		const result = await actions.signUp!(signupEvent(GOOD_SIGNUP));
		expect(result).toEqual({ success: true, email: GOOD_SIGNUP.email });
		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]).toMatchObject({ email: GOOD_SIGNUP.email });
		expect(recordConsentMock).toHaveBeenCalledWith('new-user-id', 'signup_form');
		expect(sendEmailMock).toHaveBeenCalledOnce();
	});

	it('stamps attribution from the mep_attr cookie onto a newly created user (issue #326)', async () => {
		const cookie = JSON.stringify({
			source: 'google', campaign: 'spring_launch', variant: 'b', segment: 'chefs',
			referrer: 'https://google.com/search', landingPath: '/waitlist', referredBy: 'ABC123',
		});
		const result = await actions.signUp!(signupEvent(GOOD_SIGNUP, cookie));
		expect(result).toEqual({ success: true, email: GOOD_SIGNUP.email });
		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]).toMatchObject({
			attrSource: 'google',
			attrCampaign: 'spring_launch',
			attrVariant: 'b',
			attrSegment: 'chefs',
			attrReferrer: 'https://google.com/search',
			attrLandingPath: '/waitlist',
			attrReferredBy: 'ABC123',
		});
	});

	it('stamps null attribution when there is no mep_attr cookie', async () => {
		const result = await actions.signUp!(signupEvent(GOOD_SIGNUP));
		expect(result).toEqual({ success: true, email: GOOD_SIGNUP.email });
		expect(insertedRows[0]).toMatchObject({ attrSource: null, attrCampaign: null });
	});

	it('responds identically whether the address is free, verified-taken, or unverified-taken', async () => {
		state.userRow = null;
		const free = await actions.signUp!(signupEvent(GOOD_SIGNUP));

		state.userRow = { id: 'existing-1', emailVerified: new Date() };
		const verifiedTaken = await actions.signUp!(signupEvent(GOOD_SIGNUP));

		state.userRow = { id: 'existing-2', emailVerified: null };
		const unverifiedTaken = await actions.signUp!(signupEvent(GOOD_SIGNUP));

		expect(free).toEqual({ success: true, email: GOOD_SIGNUP.email });
		expect(verifiedTaken).toEqual({ success: true, email: GOOD_SIGNUP.email });
		expect(unverifiedTaken).toEqual({ success: true, email: GOOD_SIGNUP.email });
	});

	it('does not touch an already-verified account and sends no mail', async () => {
		state.userRow = { id: 'existing-1', emailVerified: new Date() };
		const result = await actions.signUp!(signupEvent(GOOD_SIGNUP));

		expect(result).toEqual({ success: true, email: GOOD_SIGNUP.email });
		expect(insertedRows).toHaveLength(0);
		expect(updatedRows).toHaveLength(0);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(recordConsentMock).not.toHaveBeenCalled();
	});

	it('lets a new signup attempt reclaim a still-unverified row: overwrites the password and resends verification', async () => {
		state.userRow = { id: 'squatted-row', emailVerified: null };
		const result = await actions.signUp!(signupEvent({ ...GOOD_SIGNUP, password: 'real-owners-password-1' }));

		expect(result).toEqual({ success: true, email: GOOD_SIGNUP.email });
		expect(insertedRows).toHaveLength(0);
		expect(updatedRows).toHaveLength(1);
		expect(updatedRows[0]).toHaveProperty('passwordHash');
		expect(typeof updatedRows[0]!.passwordHash).toBe('string');
		expect(recordConsentMock).toHaveBeenCalledWith('squatted-row', 'signup_form');
		expect(createVerificationTokenMock).toHaveBeenCalledWith(`verify-email:${GOOD_SIGNUP.email}`);
		expect(sendEmailMock).toHaveBeenCalledOnce();
	});

	function expectNothingWritten() {
		expect(insertedRows).toHaveLength(0);
		expect(updatedRows).toHaveLength(0);
		expect(sendEmailMock).not.toHaveBeenCalled();
	}

	it('still validates password policy and terms before touching the database', async () => {
		expect(await actions.signUp!(signupEvent({ ...GOOD_SIGNUP, password: 'short' })))
			.toMatchObject({ status: 422, data: { error: 'password_too_short' } });
		expect(await actions.signUp!(signupEvent({ ...GOOD_SIGNUP, terms: '' })))
			.toMatchObject({ status: 422, data: { error: 'terms_required' } });
		expectNothingWritten();
	});

	it('rejects a file part posted under the email field with a 422 instead of crashing (issue #844)', async () => {
		const result = await actions.signUp!(
			signupEventWithFile({ email: maliciousFile('not an email'), password: GOOD_SIGNUP.password, terms: GOOD_SIGNUP.terms }),
		);
		expect(result).toMatchObject({ status: 422, data: { error: 'invalid' } });
		expectNothingWritten();
	});
});

describe('resend', () => {
	const RESEND = { email: 'chef@example.com' };

	it('rate limits by IP without ever looking up the account', async () => {
		rateLimitMock.mockResolvedValueOnce(false);
		const result = await actions.resend!(signupEvent(RESEND));
		expect(result).toEqual({ success: true, email: RESEND.email, resent: false });
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(rateLimitMock).toHaveBeenCalledWith('signup:resend:203.0.113.7', 3);
	});

	it('sends nothing for a non-existent account but returns the same success shape', async () => {
		state.userRow = null;
		const result = await actions.resend!(signupEvent(RESEND));
		expect(result).toEqual({ success: true, email: RESEND.email, resent: true });
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('sends nothing for an already-verified account but returns the same success shape', async () => {
		state.userRow = { id: 'u1', emailVerified: new Date() };
		const result = await actions.resend!(signupEvent(RESEND));
		expect(result).toEqual({ success: true, email: RESEND.email, resent: true });
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('resends for an existing unverified account', async () => {
		state.userRow = { id: 'u1', emailVerified: null };
		const result = await actions.resend!(signupEvent(RESEND));
		expect(result).toEqual({ success: true, email: RESEND.email, resent: true });
		expect(sendEmailMock).toHaveBeenCalledOnce();
		expect(createVerificationTokenMock).toHaveBeenCalledWith(`verify-email:${RESEND.email}`);
	});
});
