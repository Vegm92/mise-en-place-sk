import { describe, it, expect, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { load, actions } from '../src/routes/logout/+page.server';

const invoke = async (fn: () => unknown) => {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	return null;
};

describe('/logout', () => {
	it('purges all authjs cookies on GET and redirects to /waitlist', async () => {
		const deleted: string[] = [];
		const cookies = {
			getAll: vi.fn(() => [
				{ name: 'authjs.session-token' },
				{ name: '__Secure-authjs.session-token' },
				{ name: 'authjs.csrf-token' },
				{ name: '__Host-authjs.csrf-token' },
				{ name: 'authjs.callback-url' },
				{ name: 'other-cookie' },
			]),
			delete: vi.fn((name: string) => { deleted.push(name); }),
		};

		const thrown = await invoke(() =>
			(load as (arg: unknown) => unknown)({ cookies })
		);

		expect(deleted).toEqual([
			'authjs.session-token',
			'__Secure-authjs.session-token',
			'authjs.csrf-token',
			'__Host-authjs.csrf-token',
			'authjs.callback-url',
		]);
		expect(deleted).not.toContain('other-cookie');
		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { status: number; location: string }).status).toBe(303);
		expect((thrown as { status: number; location: string }).location).toBe('/waitlist');
	});

	it('purges all authjs cookies on POST and redirects to /waitlist', async () => {
		const deleted: string[] = [];
		const cookies = {
			getAll: vi.fn(() => [
				{ name: 'authjs.session-token' },
				{ name: '__Secure-authjs.session-token' },
				{ name: 'authjs.pkce.code_verifier' },
				{ name: 'authjs.state' },
			]),
			delete: vi.fn((name: string) => { deleted.push(name); }),
		};

		const thrown = await invoke(() =>
			(actions.default as (arg: unknown) => unknown)({ cookies })
		);

		expect(deleted).toEqual([
			'authjs.session-token',
			'__Secure-authjs.session-token',
			'authjs.pkce.code_verifier',
			'authjs.state',
		]);
		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toBe('/waitlist');
	});
});
