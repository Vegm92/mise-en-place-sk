/**
 * Decides whether DB-backed tests may run against the configured connection
 * string. Pure and side-effect free so it can be unit-tested directly (see
 * tests/db-gate.test.ts) without opening a connection.
 *
 * DB-backed suites INSERT and DELETE real rows, so they are gated on the
 * database being local/ephemeral. A hosted URL — the shape committed in
 * .env.example — requires an explicit opt-in (issue #336).
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

/** Hostname of a connection string, or '' when it cannot be parsed. */
export function dbHost(url: string): string {
	if (!url) return '';
	try {
		return new URL(url).hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
	} catch {
		return '';
	}
}

/**
 * True only for connection strings whose host is unambiguously a local or
 * ephemeral Postgres. Unparseable URLs are treated as remote (fail safe).
 */
export function isLocalDbUrl(url: string): boolean {
	return LOCAL_HOSTS.has(dbHost(url));
}

export type DbGate = {
	/** The connection string tests should use (DATABASE_TEST_URL wins). */
	url: string;
	isLocal: boolean;
	/** True when DB-backed suites may run. */
	enabled: boolean;
	/** Human-readable reason when disabled; '' when enabled. */
	skipReason: string;
};

type Env = Record<string, string | undefined>;

export function resolveDbGate(env: Env): DbGate {
	const url = env.DATABASE_TEST_URL || env.DATABASE_URL || '';
	const isLocal = isLocalDbUrl(url);

	if (!url) {
		return {
			url,
			isLocal,
			enabled: false,
			skipReason: 'neither DATABASE_TEST_URL nor DATABASE_URL is set'
		};
	}
	if (isLocal || env.ALLOW_REMOTE_DB_TESTS === '1') {
		return { url, isLocal, enabled: true, skipReason: '' };
	}
	return {
		url,
		isLocal,
		enabled: false,
		skipReason: `the configured database is not local (host: ${dbHost(url) || 'unparseable URL'})`
	};
}

/** The banner printed when the gate disables DB-backed suites. */
export function skipNotice(gate: DbGate): string {
	return [
		'',
		'━━━ SKIP NOTICE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
		'  Every DB-backed suite will be SKIPPED — this is not a pass.',
		`  Reason: ${gate.skipReason}.`,
		'  These suites create and delete restaurants, suppliers, invoices and',
		'  notifications, so they never write to a remote database by accident.',
		'  To run them, either:',
		'    • point DATABASE_TEST_URL at a local Postgres (preferred), or',
		'    • run against local Postgres — see .claude/skills/verify/SKILL.md, or',
		'    • opt in deliberately with ALLOW_REMOTE_DB_TESTS=1',
		'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
		''
	].join('\n');
}
