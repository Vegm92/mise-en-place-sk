import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

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
