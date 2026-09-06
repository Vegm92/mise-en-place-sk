/**
 * src/lib/server/migration-state.ts — the journal-vs-ledger comparison behind
 * /admin/health's "Migrations" check and the worker service's pre-deploy gate
 * (build/wait-for-migrations.js). drizzle-kit applies a migration only when its
 * journal `when` is newer than the newest `created_at` already in
 * drizzle.__drizzle_migrations, so a journal entry that sorts before an applied
 * one is never applied and must be reported as SKIPPED, not merely pending.
 *
 * The DB-gated half runs against the migrated test database and proves the
 * hash we compute per migration file is the one drizzle-kit recorded — every
 * applied row must match its journal entry, so `drifted` stays empty.
 */
import { describe, it, expect, afterAll } from 'vitest';
import {
	compareMigrations,
	describeMigrationState,
	migrationState,
	readJournal,
	unreadableMigrationState,
	type AppliedMigration,
	type JournalEntry,
} from '../src/lib/server/migration-state';
import { closeDb, hasDbEnv } from './helpers/test-db';

const entry = (idx: number, when: number, hash = `h${idx}`): JournalEntry => ({
	idx, tag: `${String(idx).padStart(4, '0')}_m${idx}`, when, hash,
});
const applied = (when: number, hash: string): AppliedMigration => ({ createdAt: when, hash });

const JOURNAL = [entry(0, 100), entry(1, 200), entry(2, 300)];

describe('compareMigrations', () => {
	it('reports a fully applied chain as current', () => {
		const state = compareMigrations(JOURNAL, [applied(100, 'h0'), applied(200, 'h1'), applied(300, 'h2')]);
		expect(state).toMatchObject({
			readable: true, journalCount: 3, appliedCount: 3, pending: [], skipped: [], drifted: [], unknownApplied: 0,
			latestJournalTag: '0002_m2', lastAppliedTag: '0002_m2', lastAppliedAt: new Date(300).toISOString(),
		});
	});

	it('lists journal entries newer than the newest applied row as pending', () => {
		const state = compareMigrations(JOURNAL, [applied(100, 'h0')]);
		expect(state.pending).toEqual(['0001_m1', '0002_m2']);
		expect(state.skipped).toEqual([]);
		expect(state.lastAppliedTag).toBe('0000_m0');
	});

	it('flags an unapplied entry older than the newest applied row as skipped', () => {
		const state = compareMigrations(JOURNAL, [applied(100, 'h0'), applied(300, 'h2')]);
		expect(state.pending).toEqual(['0001_m1']);
		expect(state.skipped).toEqual(['0001_m1']);
		expect(describeMigrationState(state)).toContain('SKIPPED');
	});

	it('flags a migration file edited after it was applied', () => {
		const state = compareMigrations(JOURNAL, [applied(100, 'h0'), applied(200, 'changed'), applied(300, 'h2')]);
		expect(state.drifted).toEqual(['0001_m1']);
		expect(state.pending).toEqual([]);
	});

	it('counts applied rows the journal no longer knows about', () => {
		const state = compareMigrations(JOURNAL, [applied(100, 'h0'), applied(150, 'x'), applied(200, 'h1'), applied(300, 'h2')]);
		expect(state.unknownApplied).toBe(1);
		expect(state.appliedCount).toBe(4);
	});

	it('treats an empty ledger as everything pending, nothing skipped', () => {
		const state = compareMigrations(JOURNAL, []);
		expect(state.pending).toHaveLength(3);
		expect(state.skipped).toEqual([]);
		expect(state.lastAppliedTag).toBeNull();
		expect(state.lastAppliedAt).toBeNull();
	});

	it('describes an unreadable ledger with its reason', () => {
		const state = unreadableMigrationState(JOURNAL, 'no grant');
		expect(state.readable).toBe(false);
		expect(state.latestJournalTag).toBe('0002_m2');
		expect(describeMigrationState(state)).toBe('no grant');
	});
});

describe('readJournal (drizzle/)', () => {
	it('reads every entry with a monotonically increasing `when`, so nothing can be skipped', () => {
		const journal = readJournal();
		expect(journal.length).toBeGreaterThan(0);
		for (let i = 1; i < journal.length; i++) {
			expect(journal[i]!.when).toBeGreaterThan(journal[i - 1]!.when);
			expect(journal[i]!.idx).toBe(journal[i - 1]!.idx + 1);
		}
		expect(journal.every((j) => /^[0-9a-f]{64}$/.test(j.hash))).toBe(true);
	});
});

describe.skipIf(!hasDbEnv)('migrationState against the migrated test database', () => {
	afterAll(async () => { await closeDb(); });

	it('sees the whole journal applied, with hashes matching drizzle-kit’s ledger', async () => {
		const state = await migrationState();
		expect(state.readable).toBe(true);
		expect(state.pending).toEqual([]);
		expect(state.skipped).toEqual([]);
		expect(state.drifted).toEqual([]);
		expect(state.lastAppliedTag).toBe(state.latestJournalTag);
		expect(state.appliedCount).toBeGreaterThanOrEqual(state.journalCount);
	});
});
