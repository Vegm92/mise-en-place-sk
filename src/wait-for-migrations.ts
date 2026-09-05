import './lib/server/env-file.js';

import { getClient } from './lib/server/db.js';
import { describeMigrationState, migrationState } from './lib/server/migration-state.js';

const TIMEOUT_MS = parseInt(process.env.MIGRATION_WAIT_TIMEOUT_MS ?? '600000', 10);
const POLL_MS = parseInt(process.env.MIGRATION_WAIT_POLL_MS ?? '5000', 10);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForMigrations(): Promise<number> {
	const started = Date.now();
	let lastError: unknown = null;
	while (Date.now() - started < TIMEOUT_MS) {
		try {
			const state = await migrationState();
			if (!state.readable) {
				console.warn(`[wait-for-migrations] cannot verify the migration ledger — proceeding. ${state.reason}`);
				return 0;
			}
			if (state.skipped.length > 0) {
				console.error(`[wait-for-migrations] journal/ledger mismatch, refusing to deploy: ${describeMigrationState(state)}`);
				return 1;
			}
			if (state.pending.length === 0) {
				console.info(`[wait-for-migrations] schema is current: ${describeMigrationState(state)}`);
				return 0;
			}
			console.info(`[wait-for-migrations] waiting for the web pre-deploy to apply: ${state.pending.join(', ')}`);
		} catch (err) {
			lastError = err;
			console.warn('[wait-for-migrations] ledger read failed, retrying:', err);
		}
		await sleep(POLL_MS);
	}
	console.error(`[wait-for-migrations] timed out after ${TIMEOUT_MS}ms`, lastError ?? '');
	return 1;
}

const code = await waitForMigrations();
await getClient().end({ timeout: 5 }).catch(() => {});
process.exit(code);
