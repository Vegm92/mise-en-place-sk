/**
 * Email verification / email-change confirm routes (issue #487).
 *
 * GET must never consume the token or mutate state — mail scanners prefetch
 * links and would burn a one-shot token before the real user clicks. Only
 * the POST action may consume the token. Re-consuming an already-burned
 * token must fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

const { consumeVerificationTokenMock, updatedRows, selectResult } = vi.hoisted(() => ({
	consumeVerificationTokenMock: vi.fn(),
	updatedRows: [] as Array<Record<string, unknown>>,
	selectResult: { rows: [] as Array<Record<string, unknown>> },
}));

vi.mock('$lib/server/verification-token', () => ({
	consumeVerificationToken: consumeVerificationTokenMock,
}));
vi.mock('$lib/server/db', () => {
	const selectLimit = () => Promise.resolve(selectResult.rows);
	const selectFrom = () => ({ where: () => ({ limit: selectLimit }) });
	const select = () => ({ from: selectFrom });

	const updateReturning = (values: Record<string, unknown>) =>
		Promise.resolve([{ id: 'u1', email: 'a@b.com', ...values }]);
	const updateSet = (values: Record<string, unknown>) => {
		updatedRows.push(values);
		return { where: () => ({ returning: () => updateReturning(values) }) };
	};
	const update = () => ({ set: updateSet });

	return { db: { select, update } };
});

import { load as verifyLoad, actions as verifyActions } from '../src/routes/verify-email/+page.server';
import { actions as confirmActions } from '../src/routes/(app)/settings/confirm-email/+page.server';

function urlEvent(params: Record<string, string>, extra: Record<string, unknown> = {}) {
	const url = new URL('https://app.example.test/verify-email');
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return { url, ...extra } as never;
}

beforeEach(() => {
	consumeVerificationTokenMock.mockReset().mockResolvedValue(true);
	updatedRows.length = 0;
	selectResult.rows = [];
});

describe('verify-email load (GET)', () => {
	it('does not consume the token or mutate the user', async () => {
		await verifyLoad(urlEvent({ email: 'a@b.com', token: 'tok' }));
		await verifyLoad(urlEvent({ email: 'a@b.com', token: 'tok' })); // prefetch/re-GET
		expect(consumeVerificationTokenMock).not.toHaveBeenCalled();
		expect(updatedRows).toHaveLength(0);
	});
});

describe('verify-email action (POST)', () => {
	it('consumes the token, marks verified, and redirects to /login?verified=1 (no session)', async () => {
		await expect(verifyActions.default!(urlEvent({ email: 'a@b.com', token: 'tok' })))
			.rejects.toSatisfy((e) => isRedirect(e) && e.location === '/login?verified=1');
		expect(consumeVerificationTokenMock).toHaveBeenCalledWith('verify-email:a@b.com', 'tok');
		expect(updatedRows).toEqual([{ emailVerified: expect.any(Date) }]);
	});

	it('fails a second POST after the token is already burned', async () => {
		consumeVerificationTokenMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		await expect(verifyActions.default!(urlEvent({ email: 'a@b.com', token: 'tok' }))).rejects.toBeDefined();
		const result = await verifyActions.default!(urlEvent({ email: 'a@b.com', token: 'tok' }));
		expect(result).toEqual({ ok: false });
	});
});

describe('confirm-email action (POST)', () => {
	it('returns a handled 409 instead of a raw 500 when the address was taken meanwhile', async () => {
		selectResult.rows = [{ id: 'other-user' }]; // email now taken
		const result = await confirmActions.default!(urlEvent(
			{ email: 'a@b.com', token: 'tok' },
			{ locals: { user: { id: 'u1' } } },
		));
		expect(result).toMatchObject({ status: 409 });
		expect(updatedRows).toHaveLength(0);
	});
});
