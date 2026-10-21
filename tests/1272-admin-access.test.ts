/**
 * RULE-358 (issue #1272): admin allowlist is case-insensitive, and a logged-out
 * visit to /admin goes to /login with a return link instead of '/'.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type User = NonNullable<App.Locals['user']>;
const user = (email: string) => ({ id: 'u1', email, name: null, image: null }) as User;

async function loadAdmin(list: string) {
	vi.resetModules();
	vi.stubEnv('AUTH_ADMIN_EMAIL', list);
	return import('../src/lib/server/admin');
}

afterEach(() => vi.unstubAllEnvs());

describe('isAdminUser', () => {
	it('matches regardless of case on either side', async () => {
		const { isAdminUser } = await loadAdmin(' Boss@Example.com , second@x.io ');
		expect(isAdminUser(user('boss@example.com'))).toBe(true);
		expect(isAdminUser(user('BOSS@EXAMPLE.COM'))).toBe(true);
		expect(isAdminUser(user('Second@X.io'))).toBe(true);
	});

	it('still refuses others, empty email and no user', async () => {
		const { isAdminUser } = await loadAdmin('boss@example.com');
		expect(isAdminUser(user('other@example.com'))).toBe(false);
		expect(isAdminUser(user(''))).toBe(false);
		expect(isAdminUser(null)).toBe(false);
	});
});

describe('(admin) layout', () => {
	async function run(locals: { user: App.Locals['user'] }) {
		const { load } = await import('../src/routes/(admin)/+layout.server');
		try {
			await (load as unknown as (e: unknown) => unknown)({ locals });
			return null;
		} catch (e) {
			return e as { status: number; location: string };
		}
	}

	it('sends a logged-out visitor to /login with a return link to /admin', async () => {
		await loadAdmin('boss@example.com');
		const r = await run({ user: null });
		expect(r).toMatchObject({ status: 303, location: '/login?redirectTo=%2Fadmin' });
	});

	it('still sends a logged-in non-admin to /', async () => {
		await loadAdmin('boss@example.com');
		const r = await run({ user: user('other@example.com') });
		expect(r).toMatchObject({ status: 303, location: '/' });
	});
});
