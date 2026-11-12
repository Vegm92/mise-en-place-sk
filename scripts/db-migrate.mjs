#!/usr/bin/env node
/**
 * Applies the drizzle migrations in ./drizzle, the same way `drizzle-kit migrate`
 * does (same drizzle.__drizzle_migrations ledger, same files), but prints the
 * real Postgres error when one fails. drizzle-kit exits 1 without saying why,
 * which left a failed Railway pre-deploy undiagnosable.
 *
 * Usage: node scripts/db-migrate.mjs
 * Connects with DATABASE_MIGRATION_URL, falling back to DATABASE_URL.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const MIGRATIONS_DIR = path.resolve(process.cwd(), process.env.DRIZZLE_MIGRATIONS_DIR ?? 'drizzle');

const migrationUrl = process.env.DATABASE_MIGRATION_URL ?? '';
const url = migrationUrl || process.env.DATABASE_URL || '';
if (!url) {
	console.error('[db-migrate] neither DATABASE_MIGRATION_URL nor DATABASE_URL is set');
	process.exit(1);
}
const source = migrationUrl ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL (DATABASE_MIGRATION_URL is not set)';
const isLocal = /localhost|127\.0\.0\.1|::1/.test(new URL(url).hostname);

const client = postgres(url, {
	max: 1,
	ssl: isLocal ? false : 'require',
	onnotice: () => {},
	connect_timeout: 30,
});

function journalTags() {
	const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'));
	return journal.entries.map((e) => ({ tag: e.tag, when: e.when }));
}

async function ledgerState() {
	try {
		const rows = await client`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`;
		const count = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
		return { lastAppliedAt: rows[0] ? Number(rows[0].created_at) : null, appliedCount: count[0].n };
	} catch (err) {
		return { lastAppliedAt: null, appliedCount: null, error: err.message };
	}
}

async function preflight() {
	const [who] = await client`
		select current_user as role,
		       (select rolsuper from pg_roles where rolname = current_user) as superuser,
		       current_database() as db,
		       (select tableowner from pg_tables where schemaname = 'public' and tablename = 'invoice_line_items') as line_items_owner`;
	const ledger = await ledgerState();
	const entries = journalTags();
	const pending = ledger.lastAppliedAt === null ? entries : entries.filter((e) => e.when > ledger.lastAppliedAt);
	console.info(
		`[db-migrate] connecting with ${source} as role "${who.role}" (superuser: ${who.superuser}) on db "${who.db}"; ` +
			`invoice_line_items owner: ${who.line_items_owner ?? 'n/a'}`,
	);
	console.info(
		`[db-migrate] journal: ${entries.length} entries; ledger: ${ledger.appliedCount ?? 'unreadable'} applied` +
			(ledger.error ? ` (${ledger.error})` : '') +
			`; pending: ${pending.length ? pending.map((e) => e.tag).join(', ') : 'none'}`,
	);
	if (who.line_items_owner && who.line_items_owner !== who.role && !who.superuser) {
		console.warn(
			`[db-migrate] role "${who.role}" does not own the app tables (owner: "${who.line_items_owner}"); ` +
				'DDL such as CREATE INDEX or ALTER TABLE will fail. Set DATABASE_MIGRATION_URL to the owner role.',
		);
	}
}

function describe(err, depth = 0) {
	if (!err || depth > 4) return [];
	const fields = ['name', 'message', 'code', 'severity', 'detail', 'hint', 'where', 'schema_name', 'table_name', 'constraint_name', 'routine'];
	const lines = fields.filter((f) => err[f] !== undefined && err[f] !== '').map((f) => `  ${f}: ${err[f]}`);
	if (err.query) lines.push(`  query: ${String(err.query).slice(0, 600)}`);
	return [...lines, ...(err.cause ? ['  cause:', ...describe(err.cause, depth + 1)] : [])];
}

let code = 0;
try {
	await preflight();
	await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
	const after = await ledgerState();
	console.info(`[db-migrate] done; ledger now has ${after.appliedCount} applied migrations`);
} catch (err) {
	code = 1;
	console.error(['[db-migrate] migration failed:', ...describe(err)].join('\n'));
} finally {
	await client.end({ timeout: 5 }).catch(() => {});
}
process.exit(code);
