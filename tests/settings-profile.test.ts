/**
 * Profile management actions in /settings (issue #293).
 *
 * Name, email, password and restaurant rename all write through Supabase or the
 * restaurants table, so the guards are what matter: a password change must
 * re-verify the current password (an unattended session is not enough), and a
 * rename is owner-only.
 *
 * db, Supabase, the rate limiter and auth telemetry are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rateLimitMock, logAuthEventMock, dbMock, membershipRole, updatedRows } = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
	logAuthEventMock: vi.fn(),
	dbMock: {} as Record<string, unknown>,
	membershipRole: { value: 'owner' as string | undefined },
	updatedRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/auth-events', () => ({ logAuthEvent: logAuthEventMock, hashIp: () => 'iphash' }));
vi.mock('$lib/server/db', () => {
	const select = () => ({
		from: () => ({
			where: () => {
				const rows = membershipRole.value ? [{ role: membershipRole.value }] : [];
				return Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
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
	Object.assign(dbMock, { select, update });
	return {
		db: dbMock,
		forTenant: (rid: string) => ({ rid, scope: () => ({}) }),
	};
});

import { actions } from '../src/routes/(app)/settings/+page.server';

const USER = { id: 'user-1', email: 'chef@example.com' };

function formEvent(fields: Record<string, string>, locals: Record<string, unknown>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	return {
		request: { formData: async () => data },
		url: new URL('https://app.example.test'),
		getClientAddress: () => '203.0.113.7',
		locals: { user: USER, restaurantId: 'rest-1', ...locals },
	} as never;
}

function supabaseStub(overrides: Record<string, unknown> = {}) {
	return {
		auth: {
			updateUser: vi.fn().mockResolvedValue({ error: null }),
			signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
			...overrides,
		},
	};
}

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
	logAuthEventMock.mockClear();
	membershipRole.value = 'owner';
	updatedRows.length = 0;
});

describe('saveName', () => {
	it('writes the display name to user_metadata', async () => {
		const supabase = supabaseStub();
		const result = await actions.saveName(formEvent({ name: '  Chef García  ' }, { supabase }));
		expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { name: 'Chef García' } });
		expect(result).toEqual({ section: 'name', ok: 'set.profile.ok.name' });
	});

	it('rejects an empty name', async () => {
		const result = await actions.saveName(formEvent({ name: '   ' }, { supabase: supabaseStub() }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.profile.err.nameRequired' } });
	});
});

describe('saveEmail', () => {
	it('starts a confirmed email change', async () => {
		const supabase = supabaseStub();
		const result = await actions.saveEmail(formEvent({ email: 'new@example.com' }, { supabase }));
		expect(supabase.auth.updateUser).toHaveBeenCalledWith(
			{ email: 'new@example.com' },
			{ emailRedirectTo: 'https://app.example.test/auth/callback?next=/settings' },
		);
		expect(result).toEqual({ section: 'email', ok: 'set.profile.ok.email' });
	});

	it('rejects the address the account already has', async () => {
		const supabase = supabaseStub();
		const result = await actions.saveEmail(formEvent({ email: 'CHEF@example.com' }, { supabase }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.profile.err.emailUnchanged' } });
		expect(supabase.auth.updateUser).not.toHaveBeenCalled();
	});
});

describe('changePassword', () => {
	const good = { current: 'oldpassword', password: 'newpassword1', confirm: 'newpassword1' };

	it('re-verifies the current password before changing it', async () => {
		const supabase = supabaseStub();
		const result = await actions.changePassword(formEvent(good, { supabase }));
		expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: USER.email, password: 'oldpassword' });
		expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword1' });
		expect(result).toEqual({ section: 'password', ok: 'set.profile.ok.password' });
		expect(logAuthEventMock).toHaveBeenCalledWith('password_changed', expect.anything());
	});

	it('refuses when the current password is wrong, without touching the password', async () => {
		const supabase = supabaseStub({
			signInWithPassword: vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } }),
		});
		const result = await actions.changePassword(formEvent(good, { supabase }));
		expect(result).toMatchObject({ status: 401, data: { error: 'set.profile.err.currentWrong' } });
		expect(supabase.auth.updateUser).not.toHaveBeenCalled();
	});

	it('rejects a short password and a mismatched confirmation before any auth call', async () => {
		const supabase = supabaseStub();
		expect(await actions.changePassword(formEvent({ ...good, password: 'short', confirm: 'short' }, { supabase })))
			.toMatchObject({ status: 422, data: { error: 'set.profile.err.passwordShort' } });
		expect(await actions.changePassword(formEvent({ ...good, confirm: 'different1' }, { supabase })))
			.toMatchObject({ status: 422, data: { error: 'set.profile.err.passwordMismatch' } });
		expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
	});

	it('rate limits repeated attempts per account', async () => {
		const supabase = supabaseStub();
		rateLimitMock.mockResolvedValueOnce(false);
		const result = await actions.changePassword(formEvent(good, { supabase }));
		expect(result).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });
		expect(rateLimitMock).toHaveBeenCalledWith('password-change:user-1', 5);
		expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
	});
});

describe('renameRestaurant', () => {
	it('renames the restaurant and the settings override for an owner', async () => {
		const result = await actions.renameRestaurant(formEvent({ name: ' Casa Lua ' }, { supabase: supabaseStub() }));
		expect(result).toEqual({ section: 'restaurant', ok: 'set.profile.ok.restaurant' });
		expect(updatedRows).toEqual([{ name: 'Casa Lua' }, { value: 'Casa Lua' }]);
	});

	it('refuses a non-owner member', async () => {
		membershipRole.value = 'member';
		const result = await actions.renameRestaurant(formEvent({ name: 'Casa Lua' }, { supabase: supabaseStub() }));
		expect(result).toMatchObject({ status: 403, data: { error: 'set.profile.err.notOwner' } });
		expect(updatedRows).toEqual([]);
	});

	it('rejects an empty name', async () => {
		const result = await actions.renameRestaurant(formEvent({ name: '  ' }, { supabase: supabaseStub() }));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.profile.err.restaurantRequired' } });
	});
});
