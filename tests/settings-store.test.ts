/**
 * The `settings` table has one owner module (issue #1275).
 *
 * Nine places used to upsert into it with their own copy of the same
 * ON CONFLICT statement. They now call settings-store.ts; this file pins the
 * store's three operations and fails when a new writer goes around it.
 * weekly-digest.ts and quota-warning.ts are the two writers still on the old
 * statement (LLM-seam part of the same phase) — drop them from the allowlist
 * when they switch.
 *
 * Also pins the settings route at fewer than 12 imports.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { claimSetting, getSetting, putSetting } from '../src/lib/server/settings-store';

const STILL_DIRECT = new Set(['src/lib/server/weekly-digest.ts', 'src/lib/server/quota-warning.ts']);

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(ts|svelte)$/.test(name) ? [path.split('\\').join('/')] : [];
	});
}

describe('settings table writers', () => {
	it('only settings-store.ts (and the two pending files) insert into it', () => {
		const writers = sourceFiles('src')
			.filter((file) => /\.insert\(\s*settings\s*\)/.test(readFileSync(file, 'utf8')))
			.filter((file) => file !== 'src/lib/server/settings-store.ts' && !STILL_DIRECT.has(file));
		expect(writers).toEqual([]);
	});

	it('the pending allowlist only names files that still write directly', () => {
		for (const file of STILL_DIRECT) expect(readFileSync(file, 'utf8')).toMatch(/\.insert\(\s*settings\s*\)/);
	});
});

describe('settings route size', () => {
	it('imports fewer than 12 modules', () => {
		const src = readFileSync('src/routes/(app)/settings/+page.server.ts', 'utf8');
		const imports = src.match(/\bfrom\s+'[^']+'/g) ?? [];
		expect(imports.length).toBeLessThan(12);
	});
});

describe.skipIf(!hasDbEnv)('settings-store', () => {
	let rid = '';
	let other = '';

	beforeAll(async () => {
		rid = (await createTestRestaurant('settings-store-a')).id;
		other = (await createTestRestaurant('settings-store-b')).id;
	});

	afterAll(async () => {
		await cleanupTestRestaurant(rid);
		await cleanupTestRestaurant(other);
		await closeDb();
	});

	it('getSetting returns null for a key that was never written', async () => {
		expect(await getSetting(rid, 'store_missing')).toBeNull();
	});

	it('putSetting inserts, then overwrites in place, per tenant', async () => {
		await putSetting(rid, 'store_key', 'a');
		await putSetting(rid, 'store_key', 'b');
		await putSetting(other, 'store_key', 'z');

		expect(await getSetting(rid, 'store_key')).toBe('b');
		expect(await getSetting(other, 'store_key')).toBe('z');
		const rows = await testSql`SELECT 1 FROM settings WHERE restaurant_id = ${rid} AND key = 'store_key'`;
		expect(rows).toHaveLength(1);
	});

	it('claimSetting wins once per value and loses on a repeat', async () => {
		expect(await claimSetting(rid, 'store_claim', '2026-W01')).toBe(true);
		expect(await claimSetting(rid, 'store_claim', '2026-W01')).toBe(false);
		expect(await claimSetting(rid, 'store_claim', '2026-W02')).toBe(true);
		expect(await getSetting(rid, 'store_claim')).toBe('2026-W02');
	});
});
