/**
 * Postgres TLS configuration, shared by the web pool (`db.ts`, postgres-js) and
 * the worker's pg-boss connection (`worker.ts`, node-postgres) — issue #295.
 *
 * Both drivers hand this object straight to `tls.connect`, so one helper can
 * serve both and the two processes can no longer drift apart (the worker used
 * to hard-code `rejectUnauthorized: false`).
 *
 * Modes, via `DATABASE_SSL_MODE`:
 *   require      (default) — connection is encrypted, certificate is not
 *                            verified. Matches Supabase's documented default
 *                            and the behaviour this app shipped with.
 *   verify-full             — certificate chain is verified. Supply the
 *                            Supabase CA with `DATABASE_CA_CERT` (a PEM string
 *                            or a path to a .crt file); without it the system
 *                            trust store is used.
 *
 * Reads `process.env` directly so the worker can import it without Vite —
 * process.env is equivalent to $env/dynamic/private under adapter-node.
 *
 * A local/ephemeral Postgres (CI service container, `docker compose` for
 * local dev) is never configured with TLS, so requesting SSL against it just
 * resets the connection ("Client network socket disconnected before secure
 * TLS connection was established"). `drizzle.config.ts` and the test-db
 * helper already special-case this by host; this does the same so the app's
 * own db/worker clients agree with migrations and tests.
 */
import { readFileSync } from 'node:fs';

export interface PgSslConfig {
	rejectUnauthorized: boolean;
	ca?: string;
}

/** Resolve DATABASE_CA_CERT, which may hold the PEM itself or a path to it. */
function readCa(value: string): string {
	return value.includes('-----BEGIN') ? value : readFileSync(value, 'utf-8');
}

export function pgSslConfig(env: NodeJS.ProcessEnv = process.env): PgSslConfig | false {
	const url = env.DATABASE_POOL_URL ?? env.DATABASE_URL ?? '';
	if (/localhost|127\.0\.0\.1/.test(url)) return false;

	const mode = env.DATABASE_SSL_MODE ?? 'require';
	const caSource = env.DATABASE_CA_CERT ?? '';

	if (mode === 'verify-full') {
		const config: PgSslConfig = { rejectUnauthorized: true };
		if (caSource) config.ca = readCa(caSource);
		return config;
	}

	if (mode !== 'require') {
		console.warn(`[db] unknown DATABASE_SSL_MODE "${mode}" — falling back to "require"`);
	}
	if (env.NODE_ENV === 'production') {
		console.warn(
			'[db] DATABASE_SSL_MODE=require — the database connection is encrypted but the server certificate is NOT verified. ' +
			'Set DATABASE_SSL_MODE=verify-full (and DATABASE_CA_CERT for Supabase) to close the MITM window.',
		);
	}
	return { rejectUnauthorized: false };
}
