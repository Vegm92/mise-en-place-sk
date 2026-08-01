/**
 * Vitest global setup — prints prominent notices when test suites will be
 * skipped, so CI logs make the coverage gap visible rather than silently
 * thinning test counts with no signal.
 *
 * dotenv is loaded here so this sees the same DATABASE_URL as
 * tests/helpers/test-db.ts, which reads it through dotenv too.
 */
import 'dotenv/config';
import { resolveDbGate, skipNotice } from '../helpers/db-gate';

export default function globalSetup() {
	const gate = resolveDbGate(process.env);
	if (!gate.enabled) {
		console.warn(skipNotice(gate));
	}

	const hasSupabase = !!(
		process.env.SUPABASE_URL &&
		process.env.SUPABASE_ANON_KEY &&
		process.env.SUPABASE_SERVICE_ROLE_KEY
	);

	if (!hasSupabase) {
		console.warn(
			[
				'',
				'━━━ SKIP NOTICE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
				'  SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY absent.',
				'  The following suites will be SKIPPED:',
				'    • supabase-connection  (1 describe block)',
				'    • supabase-auth        (3 describe blocks)',
				'  Set REQUIRE_DB_TESTS=1 to convert these skips into hard failures.',
				'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
				'',
			].join('\n')
		);
	}
}
