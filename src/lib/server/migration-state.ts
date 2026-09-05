import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from './db';

export const MIGRATIONS_DIR = process.env.DRIZZLE_MIGRATIONS_DIR ?? 'drizzle';

export interface JournalEntry {
	idx: number;
	tag: string;
	when: number;
	hash: string;
}

export interface AppliedMigration {
	hash: string;
	createdAt: number;
}

export interface MigrationState {
	readable: boolean;
	reason: string | null;
	journalCount: number;
	appliedCount: number;
	latestJournalTag: string | null;
	lastAppliedTag: string | null;
	lastAppliedAt: string | null;
	pending: string[];
	skipped: string[];
	drifted: string[];
	unknownApplied: number;
}

const INSUFFICIENT_PRIVILEGE = '42501';
const UNDEFINED_TABLE = '42P01';
const INVALID_SCHEMA_NAME = '3F000';

export function readJournal(dir = MIGRATIONS_DIR): JournalEntry[] {
	const root = path.resolve(process.cwd(), dir);
	const journal = JSON.parse(readFileSync(path.join(root, 'meta', '_journal.json'), 'utf-8')) as {
		entries: Array<{ idx: number; tag: string; when: number }>;
	};
	return journal.entries.map((entry) => {
		const query = readFileSync(path.join(root, `${entry.tag}.sql`), 'utf-8');
		return {
			idx: entry.idx,
			tag: entry.tag,
			when: entry.when,
			hash: createHash('sha256').update(query).digest('hex'),
		};
	});
}

function pgCode(err: unknown): string {
	const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
	return String(e?.code ?? e?.cause?.code ?? '');
}

export async function readAppliedMigrations(): Promise<AppliedMigration[]> {
	try {
		const rows = await db.execute(sql`
			SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC
		`);
		return (rows as unknown as Array<{ hash: string; created_at: string | number }>)
			.map((r) => ({ hash: String(r.hash), createdAt: Number(r.created_at) }));
	} catch (err) {
		const code = pgCode(err);
		if (code === UNDEFINED_TABLE || code === INVALID_SCHEMA_NAME) return [];
		throw err;
	}
}

export function isPrivilegeError(err: unknown): boolean {
	return pgCode(err) === INSUFFICIENT_PRIVILEGE;
}

export function compareMigrations(journal: JournalEntry[], applied: AppliedMigration[]): MigrationState {
	const appliedByWhen = new Map(applied.map((a) => [a.createdAt, a]));
	const journalWhens = new Set(journal.map((j) => j.when));
	const newestApplied = applied.reduce((max, a) => Math.max(max, a.createdAt), 0);

	const pending = journal.filter((j) => !appliedByWhen.has(j.when));
	const skipped = pending.filter((j) => j.when < newestApplied);
	const drifted = journal.filter((j) => {
		const row = appliedByWhen.get(j.when);
		return row !== undefined && row.hash !== j.hash;
	});
	const lastApplied = journal.filter((j) => appliedByWhen.has(j.when)).at(-1) ?? null;

	return {
		readable: true,
		reason: null,
		journalCount: journal.length,
		appliedCount: applied.length,
		latestJournalTag: journal.at(-1)?.tag ?? null,
		lastAppliedTag: lastApplied?.tag ?? null,
		lastAppliedAt: newestApplied > 0 ? new Date(newestApplied).toISOString() : null,
		pending: pending.map((j) => j.tag),
		skipped: skipped.map((j) => j.tag),
		drifted: drifted.map((j) => j.tag),
		unknownApplied: applied.filter((a) => !journalWhens.has(a.createdAt)).length,
	};
}

export function unreadableMigrationState(journal: JournalEntry[], reason: string): MigrationState {
	return {
		readable: false,
		reason,
		journalCount: journal.length,
		appliedCount: 0,
		latestJournalTag: journal.at(-1)?.tag ?? null,
		lastAppliedTag: null,
		lastAppliedAt: null,
		pending: [],
		skipped: [],
		drifted: [],
		unknownApplied: 0,
	};
}

export async function migrationState(dir = MIGRATIONS_DIR): Promise<MigrationState> {
	const journal = readJournal(dir);
	try {
		return compareMigrations(journal, await readAppliedMigrations());
	} catch (err) {
		if (isPrivilegeError(err)) {
			return unreadableMigrationState(
				journal,
				'drizzle.__drizzle_migrations is not readable by this role — re-run scripts/create-runtime-role.sql',
			);
		}
		throw err;
	}
}

export function describeMigrationState(state: MigrationState): string {
	if (!state.readable) return state.reason ?? 'unreadable';
	const parts = [`${state.appliedCount}/${state.journalCount} applied`];
	if (state.lastAppliedTag) parts.push(`last ${state.lastAppliedTag}`);
	if (state.pending.length) parts.push(`pending: ${state.pending.join(', ')}`);
	if (state.skipped.length) parts.push(`SKIPPED (older than newest applied, drizzle-kit will not apply): ${state.skipped.join(', ')}`);
	if (state.drifted.length) parts.push(`edited after apply: ${state.drifted.join(', ')}`);
	if (state.unknownApplied) parts.push(`${state.unknownApplied} applied row(s) not in journal`);
	return parts.join(' · ');
}
