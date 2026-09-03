/**
 * Profile management actions in /settings (issue #293).
 *
 * Name, email, password and restaurant rename write through the local `users`
 * table / restaurants table, so the guards are what matter: a password change
 * must re-verify the current password (an unattended session is not enough),
 * and a rename is owner-only.
 *
 * db, credential verification, verification tokens, email, the rate limiter
 * and auth telemetry are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';

const {
	rateLimitMock, logAuthEventMock, verifyCredentialsMock,
	createVerificationTokenMock, sendEmailMock, issueSessionCookieMock,
	state, updatedRows,
} = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
	logAuthEventMock: vi.fn(),
	verifyCredentialsMock: vi.fn(),
	createVerificationTokenMock: vi.fn().mockResolvedValue('tok123'),
	sendEmailMock: vi.fn().mockResolvedValue(undefined),
	issueSessionCookieMock: vi.fn().mockResolvedValue(undefined),
	state: {
		membershipRole: 'owner' as string | undefined,
		emailTaken: false,
	},
	updatedRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/auth-events', () => ({ logAuthEvent: logAuthEventMock, hashIp: () => 'iphash' }));
vi.mock('$lib/server/auth-credentials', () => ({ verifyCredentials: verifyCredentialsMock }));
vi.mock('$lib/server/verification-token', () => ({ createVerificationToken: createVerificationTokenMock }));
vi.mock('$lib/server/auth-session', () => ({ issueSessionCookie: issueSessionCookieMock }));
vi.mock('$lib/server/email', () => ({
	sendEmail: sendEmailMock,
	changeEmailAddress: (email: string, url: string) => ({ to: email, subject: 's', html: url }),
}));
vi.mock('$lib/server/db', () => {
	const rowsForTable = (name: string): Array<Record<string, unknown>> => {
		if (name === 'user_restaurants') return state.membershipRole ? [{ role: state.membershipRole }] : [];
		if (name === 'users') return state.emailTaken ? [{ id: 'someone-else' }] : [];
		return [];
	};
	const select = () => ({
		from: (table: never) => {
			const rows = rowsForTable(getTableName(table));
			const p = { where: () => p, limit: () => Promise.resolve(rows) };
			return Object.assign(Promise.resolve(rows), p);
		},
	});
	const update = () => ({
		set: (values: Record<string, unknown>) => ({
			where: () => {
				updatedRows.push(values);
				return Promise.resolve([]);
			},
		}),
	});
	return {
		db: { select, update },
		forTenant: (rid: string) => ({ rid, scope: () => ({}) }),
	};
});

import { actions } from '../src/routes/(app)/settings/+page.server';

const USER = { id: 'user-1', email: 'chef@example.com', name: null, image: null };

function formEvent(fields: Record<string, string>, locals: Record<string, unknown> = {}) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	return {
		request: { formData: async () => data },
		url: new URL('https://app.example.test'),
		getClientAddress: () => '203.0.113.7',
		cookies: { set: vi.fn(), delete: vi.fn() },
		locals: { user: USER, restaurantId: 'rest-1', ...locals },
	} as never;
}

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
	logAuthEventMock.mockClear();
	verifyCredentialsMock.mockReset().mockResolvedValue(USER);
	createVerificationTokenMock.mockClear().mockResolvedValue('tok123');
	sendEmailMock.mockClear();
	issueSessionCookieMock.mockClear();
	state.membershipRole = 'owner';
	state.emailTaken = false;
	updatedRows.length = 0;
});

describe('saveName', () => {
	it('writes the display name to the users table', async () => {
		const result = await actions.saveName(formEvent({ name: '  Chef García  ' }));
		expect(updatedRows).toEqual([{ name: 'Chef García' }]);
		expect(result).toEqual({ section: 'name', ok: 'set.profile.ok.name' });
	});

	it('rejects an empty name', async () => {
		const result = await actions.saveName(formEvent({ name: '   ' }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.profile.err.nameRequired' } });
	});
});

describe('saveEmail', () => {
	it('sends a confirmation email to the new address', async () => {
		const result = await actions.saveEmail(formEvent({ email: 'new@example.com' }));
		expect(createVerificationTokenMock).toHaveBeenCalledWith('change-email:user-1:new@example.com');
		expect(sendEmailMock).toHaveBeenCalledOnce();
		expect(result).toEqual({ section: 'email', ok: 'set.profile.ok.email' });
	});

	it('rejects the address the account already has', async () => {
		const result = await actions.saveEmail(formEvent({ email: 'CHEF@example.com' }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.profile.err.emailUnchanged' } });
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('rejects an address already taken by another account', async () => {
		state.emailTaken = true;
		const result = await actions.saveEmail(formEvent({ email: 'new@example.com' }));
		expect(result).toMatchObject({ status: 400, data: { error: 'set.profile.err.emailFailed' } });
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('rate limits repeated attempts per account', async () => {
		rateLimitMock.mockResolvedValueOnce(false);
		const result = await actions.saveEmail(formEvent({ email: 'new@example.com' }));
		expect(result).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });
		expect(rateLimitMock).toHaveBeenCalledWith('email-change:user:user-1', 5);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('rate limits repeated attempts per target address', async () => {
		rateLimitMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		const result = await actions.saveEmail(formEvent({ email: 'new@example.com' }));
		expect(result).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });
		expect(rateLimitMock).toHaveBeenCalledWith('email-change:address:new@example.com', 5);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});
});

describe('changePassword', () => {
	const good = { current: 'oldpassword', password: 'newpassword1', confirm: 'newpassword1' };

	it('re-verifies the current password before changing it', async () => {
		const result = await actions.changePassword(formEvent(good));
		expect(verifyCredentialsMock).toHaveBeenCalledWith(USER.email, 'oldpassword');
		expect(updatedRows).toHaveLength(1);
		expect(updatedRows[0]).toHaveProperty('passwordHash');
		expect(result).toEqual({ section: 'password', ok: 'set.profile.ok.password' });
		expect(logAuthEventMock).toHaveBeenCalledWith('password_changed', expect.anything());
	});

	it('bumps tokenVersion to revoke other sessions, then re-issues the current cookie so this device stays signed in', async () => {
		await actions.changePassword(formEvent(good));
		expect(updatedRows[0]).toHaveProperty('tokenVersion');
		expect(issueSessionCookieMock).toHaveBeenCalledWith(expect.anything(), true, USER);
	});

	it('refuses when the current password is wrong, without touching the password', async () => {
		verifyCredentialsMock.mockResolvedValue(null);
		const result = await actions.changePassword(formEvent(good));
		expect(result).toMatchObject({ status: 401, data: { error: 'set.profile.err.currentWrong' } });
		expect(updatedRows).toEqual([]);
	});

	it('rejects a short password and a mismatched confirmation before any auth call', async () => {
		expect(await actions.changePassword(formEvent({ ...good, password: 'short', confirm: 'short' })))
			.toMatchObject({ status: 422, data: { error: 'set.profile.err.passwordShort' } });
		expect(await actions.changePassword(formEvent({ ...good, confirm: 'different1' })))
			.toMatchObject({ status: 422, data: { error: 'set.profile.err.passwordMismatch' } });
		expect(verifyCredentialsMock).not.toHaveBeenCalled();
	});

	it('rate limits repeated attempts per account', async () => {
		rateLimitMock.mockResolvedValueOnce(false);
		const result = await actions.changePassword(formEvent(good));
		expect(result).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });
		expect(rateLimitMock).toHaveBeenCalledWith('password-change:user-1', 5);
		expect(verifyCredentialsMock).not.toHaveBeenCalled();
	});
});

describe('renameRestaurant', () => {
	it('renames the restaurant for an owner, writing only the restaurants table (issue #515)', async () => {
		const result = await actions.renameRestaurant(formEvent({ name: ' Casa Lua ' }));
		expect(result).toEqual({ section: 'restaurant', ok: 'set.profile.ok.restaurant' });
		expect(updatedRows).toEqual([{ name: 'Casa Lua' }]);
	});

	it('refuses a non-owner member', async () => {
		state.membershipRole = 'member';
		const result = await actions.renameRestaurant(formEvent({ name: 'Casa Lua' }));
		expect(result).toMatchObject({ status: 403, data: { error: 'set.profile.err.notOwner' } });
		expect(updatedRows).toEqual([]);
	});

	it('rejects an empty name', async () => {
		const result = await actions.renameRestaurant(formEvent({ name: '  ' }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.profile.err.restaurantRequired' } });
	});
});

describe('saveFiscalIdentity', () => {
	const good = { legalName: '  Casa Lua SL  ', tradeName: '  Can Lua  ', cifNif: 'b-99.999.997', fiscalAddress: '  Carrer Major 3  ' };

	it('stores the tax id normalised and trims the free-text fields (issue #905)', async () => {
		const result = await actions.saveFiscalIdentity(formEvent({ ...good, cifNif: 'es b99999997' }));
		expect(result).toEqual({ section: 'fiscal', ok: 'set.fiscal.ok.saved' });
		expect(updatedRows).toEqual([{ legalName: 'Casa Lua SL', tradeName: 'Can Lua', cifNif: 'B99999997', fiscalAddress: 'Carrer Major 3', phone: null }]);
	});

	it('clears the fields when submitted empty', async () => {
		const result = await actions.saveFiscalIdentity(formEvent({ legalName: '', tradeName: '', cifNif: '', fiscalAddress: '', phone: '' }));
		expect(result).toEqual({ section: 'fiscal', ok: 'set.fiscal.ok.saved' });
		expect(updatedRows).toEqual([{ legalName: null, tradeName: null, cifNif: null, fiscalAddress: null, phone: null }]);
	});

	it('rejects an overlong trade name, without writing', async () => {
		const result = await actions.saveFiscalIdentity(formEvent({ ...good, tradeName: 'x'.repeat(201) }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.fiscal.err.tradeNameTooLong' } });
		expect(updatedRows).toEqual([]);
	});

	it('rejects a tax id that fails its checksum, without writing', async () => {
		const result = await actions.saveFiscalIdentity(formEvent({ ...good, cifNif: 'B99999998' }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.fiscal.err.taxId' } });
		expect(updatedRows).toEqual([]);
	});

	it('refuses a non-owner member', async () => {
		state.membershipRole = 'member';
		const result = await actions.saveFiscalIdentity(formEvent(good));
		expect(result).toMatchObject({ status: 403, data: { error: 'set.fiscal.err.notOwner' } });
		expect(updatedRows).toEqual([]);
	});

	// Issue #918: the owner can also set/correct the restaurant's own phone here —
	// the one place allowed to overwrite it, since it's an explicit, deliberate edit.
	it('stores the phone trimmed', async () => {
		const result = await actions.saveFiscalIdentity(formEvent({ ...good, phone: '  +34 971 00 11 22  ' }));
		expect(result).toEqual({ section: 'fiscal', ok: 'set.fiscal.ok.saved' });
		expect(updatedRows).toEqual([{ legalName: 'Casa Lua SL', tradeName: 'Can Lua', cifNif: 'B99999997', fiscalAddress: 'Carrer Major 3', phone: '+34 971 00 11 22' }]);
	});

	it('rejects an overlong phone, without writing', async () => {
		const result = await actions.saveFiscalIdentity(formEvent({ ...good, phone: '1'.repeat(41) }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.fiscal.err.phoneTooLong' } });
		expect(updatedRows).toEqual([]);
	});
});
