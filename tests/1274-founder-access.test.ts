/**
 * RULE-272 (issue #1274): founder follows signup time; revoke clears it and
 * cannot report success for a user that does not exist.
 *
 * DB-backed against local Postgres; email is mocked.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	return { db: testDb, runAsSystem: (fn: () => unknown) => fn() };
});
vi.mock('$lib/server/email', () => ({
	sendEmail: vi.fn(async () => {}),
	accessApprovedEmail: vi.fn(() => ({})),
	waitlistInviteEmail: vi.fn(() => ({})),
	promoCodeEmail: vi.fn(() => ({})),
}));
vi.mock('$lib/server/admin', () => ({ isAdminUser: () => true }));

import { actions } from '../src/routes/(admin)/admin/access/+page.server';
import { testSql, closeDb, hasDbEnv } from './helpers/test-db';

const DAY = 86_400_000;

async function setFlag(value: string, updatedAt: Date) {
	await testSql`
		INSERT INTO app_flags (key, value, updated_at) VALUES ('access_open', ${value}, ${updatedAt.toISOString()})
		ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = ${updatedAt.toISOString()}
	`;
}

async function insertUser(createdAt: Date, founder = false) {
	const [row] = await testSql`
		INSERT INTO users (email, founder, created_at, access_status)
		VALUES (${`founder-${randomUUID()}@example.test`}, ${founder}, ${createdAt.toISOString()}, 'pending') RETURNING id
	`;
	return row!.id as string;
}

async function userRow(id: string) {
	const [row] = await testSql`SELECT access_status, founder FROM users WHERE id = ${id}`;
	return row as { access_status: string; founder: boolean };
}

function event(userId: string) {
	const data = new FormData();
	data.set('userId', userId);
	return { request: { formData: async () => data }, locals: { user: { id: 'admin', email: 'a@x.test' } } } as never;
}

describe.skipIf(!hasDbEnv)('admin access: founder follows signup time', () => {
	let prevFlag: { value: string; updated_at: string | Date } | undefined;

	beforeAll(async () => {
		prevFlag = (await testSql`SELECT value, updated_at FROM app_flags WHERE key = 'access_open'`)[0] as typeof prevFlag;
	});

	afterAll(async () => {
		if (prevFlag) await setFlag(prevFlag.value, new Date(prevFlag.updated_at));
		else await testSql`DELETE FROM app_flags WHERE key = 'access_open'`;
		await closeDb();
	});

	it('closed access: approving makes a founder', async () => {
		await setFlag('false', new Date());
		const id = await insertUser(new Date());
		await actions.approve!(event(id));
		expect((await userRow(id)).founder).toBe(true);
	});

	it('open access: a signup from before it opened is a founder, a later one is not', async () => {
		const opened = new Date(Date.now() - 5 * DAY);
		await setFlag('true', opened);
		const early = await insertUser(new Date(opened.getTime() - DAY));
		const late = await insertUser(new Date(opened.getTime() + DAY));
		await actions.approve!(event(early));
		await actions.approve!(event(late));
		expect((await userRow(early)).founder).toBe(true);
		expect((await userRow(late)).founder).toBe(false);
	});

	it('revoke clears founder and returns the account to pending', async () => {
		const id = await insertUser(new Date(), true);
		await testSql`UPDATE users SET access_status = 'approved' WHERE id = ${id}`;
		const result = await actions.revoke!(event(id));
		expect(result).toEqual({ success: true });
		expect(await userRow(id)).toEqual({ access_status: 'pending', founder: false });
	});

	it('revoke of an unknown user is a 404, not success', async () => {
		const result = await actions.revoke!(event(randomUUID())) as { status: number };
		expect(result.status).toBe(404);
	});
});
