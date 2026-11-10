/**
 * Password sign-in outcome (RULE-160).
 *
 * A session is issued only for a correct password on a verified account.
 * A correct password on an unverified account is told to verify (403); every
 * other failure — unknown email, wrong password, Google-only account — is the
 * same generic 401, so the form cannot be used to enumerate accounts. db is
 * mocked; bcrypt is real so the compare path is exercised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const { state, issueCookieMock, logAuthEventMock, rateLimitMock } = vi.hoisted(() => ({
	state: { userRow: null as Record<string, unknown> | null },
	issueCookieMock: vi.fn().mockResolvedValue(undefined),
	logAuthEventMock: vi.fn(),
	rateLimitMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({ where: () => ({ limit: () => Promise.resolve(state.userRow ? [state.userRow] : []) }) }),
		}),
	},
}));
vi.mock('$lib/server/auth-session', () => ({ issueSessionCookie: issueCookieMock }));
vi.mock('$lib/server/auth-events', () => ({ logAuthEvent: logAuthEventMock, hashIp: () => 'iphash' }));
vi.mock('$lib/server/rate-limiter', () => ({
	checkRateLimit: rateLimitMock,
}));
vi.mock('$lib/server/auth', () => ({ signIn: vi.fn() }));
vi.mock('$lib/server/resend-verification-action', () => ({ resendVerificationAction: () => vi.fn() }));
vi.mock('$lib/server/waitlist-db', () => ({ countWaitlistEmails: vi.fn().mockResolvedValue(3) }));

import { actions, load } from '../src/routes/login/+page.server';

const PASSWORD = 'correct horse battery';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function userRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'u1', email: 'ana@x.com', name: 'Ana', image: null,
		passwordHash: HASH, emailVerified: new Date(), ...overrides,
	};
}

function signInEvent(fields: Record<string, string>, protocol = 'https:') {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	return {
		request: { formData: async () => form },
		getClientAddress: () => '203.0.113.9',
		cookies: {},
		url: new URL(`${protocol}//mise-place.com/login`),
	} as never;
}

async function run(fields: Record<string, string>, protocol?: string) {
	try {
		return { result: await actions.signIn!(signInEvent(fields, protocol)) as { status: number; data: Record<string, unknown> } };
	} catch (e) {
		return { thrown: e as { status: number; location: string } };
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	rateLimitMock.mockResolvedValue(true);
	state.userRow = userRow();
});

describe('RULE-160 — signIn action', () => {
	it('verified account + right password: issues the session cookie and redirects to /', async () => {
		const { thrown } = await run({ email: 'ana@x.com', password: PASSWORD });
		expect(thrown).toMatchObject({ status: 303, location: '/' });
		expect(issueCookieMock).toHaveBeenCalledWith({}, true, { id: 'u1', email: 'ana@x.com', name: 'Ana', image: null });
	});

	it('marks the cookie secure only over https', async () => {
		await run({ email: 'ana@x.com', password: PASSWORD }, 'http:');
		expect(issueCookieMock).toHaveBeenCalledWith({}, false, expect.any(Object));
	});

	it('redirects to a safe redirectTo and ignores an off-site one', async () => {
		const safe = await run({ email: 'ana@x.com', password: PASSWORD, redirectTo: '/invoices' });
		expect(safe.thrown).toMatchObject({ status: 303, location: '/invoices' });
		const offsite = await run({ email: 'ana@x.com', password: PASSWORD, redirectTo: 'https://evil.example/x' });
		expect(offsite.thrown).toMatchObject({ status: 303, location: '/' });
	});

	it('correct password on an unverified account: 403 unverified, logged with scope unverified, no session', async () => {
		state.userRow = userRow({ emailVerified: null });
		const { result } = await run({ email: 'ana@x.com', password: PASSWORD });
		expect(result).toMatchObject({ status: 403, data: { error: 'unverified', email: 'ana@x.com' } });
		expect(logAuthEventMock).toHaveBeenCalledWith('login_failed', { ipHash: 'iphash', scope: 'unverified' });
		expect(issueCookieMock).not.toHaveBeenCalled();
	});

	it('wrong password on an unverified account stays a generic invalid (verification state is not revealed)', async () => {
		state.userRow = userRow({ emailVerified: null });
		const { result } = await run({ email: 'ana@x.com', password: 'nope' });
		expect(result).toMatchObject({ status: 401, data: { error: 'invalid' } });
	});

	it.each([
		['wrong password', () => userRow(), 'nope'],
		['unknown email', () => null, PASSWORD],
		['no password hash (Google-only)', () => userRow({ passwordHash: null }), PASSWORD],
	])('%s: the same 401 invalid, a login_failed event, no session', async (_name, row, password) => {
		state.userRow = row();
		const { result } = await run({ email: 'ana@x.com', password });
		expect(result).toMatchObject({ status: 401, data: { error: 'invalid', email: 'ana@x.com' } });
		expect(logAuthEventMock).toHaveBeenCalledWith('login_failed', { ipHash: 'iphash' });
		expect(issueCookieMock).not.toHaveBeenCalled();
	});

	it.each([
		['email', { password: PASSWORD }],
		['password', { email: 'ana@x.com' }],
	])('missing %s: 422 missing', async (_name, fields) => {
		const { result } = await run(fields);
		expect(result).toMatchObject({ status: 422, data: { error: 'missing' } });
		expect(issueCookieMock).not.toHaveBeenCalled();
	});
});

describe('RULE-160 — load', () => {
	it('sends an already signed-in visitor to the safe redirectTo', async () => {
		await expect(load({ locals: { user: { id: 'u1' } }, url: new URL('https://mise-place.com/login?redirectTo=/invoices') } as never))
			.rejects.toMatchObject({ status: 303, location: '/invoices' });
	});
});
