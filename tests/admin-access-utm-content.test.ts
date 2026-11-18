/**
 * /admin/access shows utm_campaign + utm_content next to signups (users.attr_*)
 * and waitlist rows; rows without utm_content render as null and the page
 * still loads.
 *
 * DB-backed against local Postgres; email and admin gate are mocked.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';

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

import { load } from '../src/routes/(admin)/admin/access/+page.server';
import { testSql, closeDb, hasDbEnv } from './helpers/test-db';

const describeDb = hasDbEnv ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

afterAll(async () => {
	if (hasDbEnv) {
		await testSql`DELETE FROM waitlist WHERE email LIKE ${`utmc-${tag}%`}`;
		await testSql`DELETE FROM users WHERE email LIKE ${`utmc-${tag}%`}`;
		await closeDb();
	}
});

describeDb('/admin/access load — utm_content', () => {
	it('returns campaign and content for accounts and waitlist; null when content is missing', async () => {
		await testSql`INSERT INTO users (email, access_status, attr_campaign, attr_content) VALUES (${`utmc-${tag}-u1@example.test`}, 'pending', 'redes-pieza-s1-a', 'reel-3-a')`;
		await testSql`INSERT INTO users (email, access_status, attr_campaign) VALUES (${`utmc-${tag}-u2@example.test`}, 'pending', 'redes-pieza-s1-b')`;
		await testSql`INSERT INTO waitlist (email, campaign, content) VALUES (${`utmc-${tag}-w1@example.test`}, 'redes-pieza-s1-a', 'story-2-a')`;
		await testSql`INSERT INTO waitlist (email) VALUES (${`utmc-${tag}-w2@example.test`})`;

		const data = (await (load as unknown as (e: unknown) => Promise<{ accounts: Record<string, unknown>[]; pendingInvites: Record<string, unknown>[] }>)({}));
		const acc = (n: string) => data.accounts.find((a) => a.email === `utmc-${tag}-${n}@example.test`)!;
		const wl = (n: string) => data.pendingInvites.find((w) => w.email === `utmc-${tag}-${n}@example.test`)!;

		expect(acc('u1').attr_campaign).toBe('redes-pieza-s1-a');
		expect(acc('u1').attr_content).toBe('reel-3-a');
		expect(acc('u2').attr_campaign).toBe('redes-pieza-s1-b');
		expect(acc('u2').attr_content).toBeNull();
		expect(wl('w1').campaign).toBe('redes-pieza-s1-a');
		expect(wl('w1').content).toBe('story-2-a');
		expect(wl('w2').campaign).toBeNull();
		expect(wl('w2').content).toBeNull();
	});
});

describe('/admin/access page renders the utm_content column', () => {
	const svelte = readFileSync('src/routes/(admin)/admin/access/+page.svelte', 'utf8');
	it('has a content header and cell in both tables', () => {
		expect(svelte.match(/admin\.access\.colContent/g)).toHaveLength(2);
		expect(svelte).toContain('{a.attr_content ?? ');
		expect(svelte).toContain('{w.content ?? ');
	});
});
