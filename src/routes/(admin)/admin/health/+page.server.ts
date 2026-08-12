import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { and, inArray, lt, sql } from 'drizzle-orm';
import { batchItems } from '$lib/server/schema';
import { env } from '$env/dynamic/private';
import {
	contactsPerTenant,
	getNumberHealth,
	recentAccountEvents,
	type NumberHealth,
} from '$lib/server/whatsapp-health';
import { getIssueSummary } from '$lib/server/sentry-api';
import { SENTRY_AUTH_TOKEN } from '$lib/server/env';
import { pendingDeadLetterCount } from '$lib/server/dead-letter';

const STUCK_MINUTES = 15;
const STUCK_ERROR_THRESHOLD = 10;
const DEAD_LETTER_ERROR_THRESHOLD = 25;

export const load: PageServerLoad = async () => {
	const checks: { name: string; status: 'ok' | 'warn' | 'error'; detail: string }[] = [];

	let dbOk = false;
	try {
		await db.execute(sql`SELECT 1`);
		dbOk = true;
		checks.push({ name: 'Database', status: 'ok', detail: 'Connection healthy' });
	} catch (e) {
		checks.push({ name: 'Database', status: 'error', detail: String(e) });
	}

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
		}
	}

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

		try {
			const pending = await pendingDeadLetterCount();
			checks.push({
				name: 'Dead letter queue',
				status: pending > DEAD_LETTER_ERROR_THRESHOLD ? 'error' : pending > 0 ? 'warn' : 'ok',
				detail: pending > 0
					? `${pending} record(s) parked for audit — see /admin/dead-letters`
					: 'No parked records',
			});
		} catch (e) {
			checks.push({ name: 'Dead letter queue', status: 'warn', detail: `Check failed: ${String(e)}` });
		}
	}

	let whatsapp: {
		health: NumberHealth;
		events: Awaited<ReturnType<typeof recentAccountEvents>>;
		tenants: Awaited<ReturnType<typeof contactsPerTenant>>;
	} | null = null;
	if (dbOk) {
		try {
			const [health, events, tenants] = await Promise.all([
				getNumberHealth(),
				recentAccountEvents(),
				contactsPerTenant(),
			]);
			whatsapp = { health, events, tenants };
			checks.push({
				name: 'WhatsApp number',
				status: !health.everReported
					? 'warn'
					: health.severity === 'critical' ? 'error' : health.severity === 'warning' ? 'warn' : 'ok',
				detail: !health.everReported
					? 'No account events received — subscribe to account_update / phone_number_quality_update'
					: `Quality ${health.qualityRating ?? 'unknown'}`
						+ (health.messagingLimit ? `, limit ${health.messagingLimit}` : '')
						+ (health.lastEvent ? ` · last: ${health.lastEvent}` : ''),
			});
		} catch (e) {
			checks.push({ name: 'WhatsApp number', status: 'warn', detail: `Check failed: ${String(e)}` });
		}
	}

	if (!SENTRY_AUTH_TOKEN) {
		checks.push({ name: 'Sentry', status: 'warn', detail: 'Not configured (SENTRY_AUTH_TOKEN unset)' });
	} else {
		try {
			const summary = await getIssueSummary();
			const unresolved = summary?.unresolvedCount ?? 0;
			const critical = summary?.criticalCount ?? 0;
			checks.push({
				name: 'Sentry',
				status: critical > 0 ? 'error' : unresolved > 0 ? 'warn' : 'ok',
				detail: `${unresolved} unresolved (${critical} critical) — see /admin/errors`,
			});
		} catch (e) {
			checks.push({ name: 'Sentry', status: 'warn', detail: `Check failed: ${String(e)}` });
		}
	}

	const requiredVars = [
		'DATABASE_URL',
		'GEMINI_API_KEY',
		'AUTH_ADMIN_EMAIL',
		'AUTH_SECRET',
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
		whatsapp,
		checkedAt: new Date().toISOString(),
	};
};
