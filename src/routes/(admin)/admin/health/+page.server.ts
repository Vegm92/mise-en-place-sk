import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { and, inArray, lt, sql } from 'drizzle-orm';
import { batchItems } from '$lib/server/schema';
import { env } from '$env/dynamic/private';

// A worker that died leaves items stuck in queued/extracting. Warn on any
// item stuck past this; error past the count threshold (issue #257).
const STUCK_MINUTES = 15;
const STUCK_ERROR_THRESHOLD = 10;

export const load: PageServerLoad = async () => {
	const checks: { name: string; status: 'ok' | 'warn' | 'error'; detail: string }[] = [];

	// DB connectivity
	let dbOk = false;
	try {
		await db.execute(sql`SELECT 1`);
		dbOk = true;
		checks.push({ name: 'Database', status: 'ok', detail: 'Connection healthy' });
	} catch (e) {
		checks.push({ name: 'Database', status: 'error', detail: String(e) });
	}

	// Table record counts (only if DB is reachable)
	let tableCounts: Array<{ table: string; rows: number }> = [];
	if (dbOk) {
		try {
			const rows = await db.execute<{ relname: string; n_live_tup: string }>(sql`
				SELECT relname, n_live_tup
				FROM pg_stat_user_tables
				ORDER BY n_live_tup DESC
			`);
			tableCounts = (rows as unknown as Array<{ relname: string; n_live_tup: string }>)
				.map(r => ({ table: r.relname, rows: Number(r.n_live_tup) }));
		} catch {
			// pg_stat not available in all environments
		}
	}

	// Worker liveness + queue depth — a worker that died Friday night otherwise
	// shows a green page while invoices pile up in 'queued' (issue #257).
	if (dbOk) {
		try {
			const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
			const [stuckRow] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(batchItems)
				.where(and(
					inArray(batchItems.status, ['queued', 'extracting']),
					lt(batchItems.updatedAt, cutoff),
				));
			const stuck = stuckRow?.n ?? 0;
			checks.push({
				name: 'Extraction queue',
				status: stuck > STUCK_ERROR_THRESHOLD ? 'error' : stuck > 0 ? 'warn' : 'ok',
				detail: stuck > 0
					? `${stuck} item(s) stuck in queued/extracting > ${STUCK_MINUTES} min`
					: 'No stalled items',
			});

			const [lastRow] = await db
				.select({ at: sql<string | null>`max(${batchItems.updatedAt})` })
				.from(batchItems)
				.where(inArray(batchItems.status, ['done', 'failed', 'confirmed']));
			checks.push({
				name: 'Last extraction',
				status: 'ok',
				detail: lastRow?.at ? new Date(lastRow.at).toISOString() : 'No extractions yet',
			});
		} catch (e) {
			checks.push({ name: 'Extraction queue', status: 'warn', detail: `Check failed: ${String(e)}` });
		}
	}

	// Required env vars
	const requiredVars = [
		'DATABASE_URL',
		'GEMINI_API_KEY',
		'AUTH_ADMIN_EMAIL',
		'SUPABASE_URL',
		'SUPABASE_SERVICE_ROLE_KEY',
	];
	for (const varName of requiredVars) {
		const val = env[varName];
		checks.push({
			name: `Env: ${varName}`,
			status: val ? 'ok' : 'warn',
			detail: val ? 'Set' : 'Missing',
		});
	}

	const overallStatus = checks.some(c => c.status === 'error')
		? 'error'
		: checks.some(c => c.status === 'warn')
			? 'warn'
			: 'ok';

	return {
		title: 'Admin · Health',
		overallStatus,
		checks,
		tableCounts,
		checkedAt: new Date().toISOString(),
	};
};
