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
}
