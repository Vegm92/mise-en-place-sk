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
	it('redirects a GET to /waitlist instead of rendering a page', async () => {
		const thrown = await invoke(() => (load as (arg: unknown) => unknown)({}));

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { status: number; location: string }).status).toBe(303);
		expect((thrown as { status: number; location: string }).location).toBe('/waitlist');
	});

	it('clears both session cookies on POST and redirects to /waitlist', async () => {
		const deleted: string[] = [];
		const cookies = {
			delete: vi.fn((name: string) => {
				deleted.push(name);
			}),
		};

		const thrown = await invoke(() =>
			(actions.default as (arg: unknown) => unknown)({ cookies })
		);

		expect(deleted).toEqual(['authjs.session-token', '__Secure-authjs.session-token']);
		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toBe('/waitlist');
	});
});
