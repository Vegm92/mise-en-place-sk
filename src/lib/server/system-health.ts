import { db } from './db';
import { and, inArray, lt, sql } from 'drizzle-orm';
import { batchItems } from './schema';
import { env } from '$env/dynamic/private';
import {
	contactsPerTenant,
	getNumberHealth,
	recentAccountEvents,
	type NumberHealth,
} from './whatsapp-health';
import { getIssueSummary, isSentryConfigured } from './sentry-api';
import { pendingDeadLetterCount } from './dead-letter';

const STUCK_MINUTES = 15;
const STUCK_ERROR_THRESHOLD = 10;
const DEAD_LETTER_ERROR_THRESHOLD = 25;

const REQUIRED_VARS = [
	'DATABASE_URL',
	'GEMINI_API_KEY',
	'AUTH_ADMIN_EMAIL',
	'AUTH_SECRET',
] as const;

export type HealthStatus = 'ok' | 'warn' | 'error';

export interface HealthCheck {
	name: string;
	status: HealthStatus;
	detail: string;
	href?: string;
}

export interface WhatsAppDetail {
	health: NumberHealth;
	events: Awaited<ReturnType<typeof recentAccountEvents>>;
	tenants: Awaited<ReturnType<typeof contactsPerTenant>>;
}

export interface SystemHealth {
	checks: HealthCheck[];
	overall: HealthStatus;
	whatsapp: WhatsAppDetail | null;
	sentry: { configured: boolean; unresolved: number; critical: number };
	queue: { stuck: number; lastExtraction: string | null };
	deadLetters: { pending: number };
	checkedAt: string;
}

function worst(checks: HealthCheck[]): HealthStatus {
	if (checks.some(c => c.status === 'error')) return 'error';
	if (checks.some(c => c.status === 'warn')) return 'warn';
	return 'ok';
}

export async function runSystemChecks(): Promise<SystemHealth> {
	const checks: HealthCheck[] = [];

	let dbOk = false;
	try {
		await db.execute(sql`SELECT 1`);
		dbOk = true;
		checks.push({ name: 'Database', status: 'ok', detail: 'Connection healthy' });
	} catch (e) {
		checks.push({ name: 'Database', status: 'error', detail: String(e) });
	}

	let stuck = 0;
	let lastExtraction: string | null = null;
	if (dbOk) {
		try {
			const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
			// tenant-scope-ok: platform-wide queue health for the admin ops dashboard —
			// a per-tenant count would hide a stalled worker. Returns a bare count, no rows.
			const [stuckRow] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(batchItems)
				.where(and(
					inArray(batchItems.status, ['queued', 'extracting']),
					lt(batchItems.updatedAt, cutoff),
				));
			stuck = stuckRow?.n ?? 0;
			checks.push({
				name: 'Extraction queue',
				status: stuck > STUCK_ERROR_THRESHOLD ? 'error' : stuck > 0 ? 'warn' : 'ok',
				detail: stuck > 0
					? `${stuck} item(s) stuck in queued/extracting > ${STUCK_MINUTES} min`
					: 'No stalled items',
			});

			// tenant-scope-ok: platform-wide liveness probe for the admin ops dashboard,
			// same gate as the stuck-item count. Returns a timestamp, no tenant rows.
			const [lastRow] = await db
				.select({ at: sql<string | null>`max(${batchItems.updatedAt})` })
				.from(batchItems)
				.where(inArray(batchItems.status, ['done', 'failed', 'confirmed']));
			lastExtraction = lastRow?.at ? new Date(lastRow.at).toISOString() : null;
			checks.push({
				name: 'Last extraction',
				status: 'ok',
				detail: lastExtraction ?? 'No extractions yet',
			});
		} catch (e) {
			checks.push({ name: 'Extraction queue', status: 'warn', detail: `Check failed: ${String(e)}` });
		}
	}

	let pendingDeadLetters = 0;
	if (dbOk) {
		try {
			pendingDeadLetters = await pendingDeadLetterCount();
			checks.push({
				name: 'Dead letter queue',
				status: pendingDeadLetters > DEAD_LETTER_ERROR_THRESHOLD
					? 'error'
					: pendingDeadLetters > 0 ? 'warn' : 'ok',
				detail: pendingDeadLetters > 0
					? `${pendingDeadLetters} record(s) parked for audit`
					: 'No parked records',
				href: '/admin/dead-letters',
			});
		} catch (e) {
			checks.push({ name: 'Dead letter queue', status: 'warn', detail: `Check failed: ${String(e)}` });
		}
	}

	let whatsapp: WhatsAppDetail | null = null;
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

	let unresolved = 0;
	let critical = 0;
	if (!isSentryConfigured()) {
		checks.push({ name: 'Sentry', status: 'warn', detail: 'Not configured (set SENTRY_AUTH_TOKEN and SENTRY_ORG)' });
	} else {
		try {
			const summary = await getIssueSummary();
			unresolved = summary?.unresolvedCount ?? 0;
			critical = summary?.criticalCount ?? 0;
			checks.push({
				name: 'Sentry',
				status: critical > 0 ? 'error' : unresolved > 0 ? 'warn' : 'ok',
				detail: `${unresolved} unresolved (${critical} critical)`,
				href: '/admin/errors',
			});
		} catch (e) {
			checks.push({ name: 'Sentry', status: 'warn', detail: `Check failed: ${String(e)}` });
		}
	}

	for (const varName of REQUIRED_VARS) {
		const val = env[varName];
		checks.push({
			name: `Env: ${varName}`,
			status: val ? 'ok' : 'warn',
			detail: val ? 'Set' : 'Missing',
		});
	}

	return {
		checks,
		overall: worst(checks),
		whatsapp,
		sentry: { configured: isSentryConfigured(), unresolved, critical },
		queue: { stuck, lastExtraction },
		deadLetters: { pending: pendingDeadLetters },
		checkedAt: new Date().toISOString(),
	};
}

export async function tableRowCounts(): Promise<Array<{ table: string; rows: number }>> {
	try {
		const rows = await db.execute<{ relname: string; n_live_tup: string }>(sql`
			SELECT relname, n_live_tup
			FROM pg_stat_user_tables
			ORDER BY n_live_tup DESC
		`);
		return (rows as unknown as Array<{ relname: string; n_live_tup: string }>)
			.map(r => ({ table: r.relname, rows: Number(r.n_live_tup) }));
	} catch {
		return [];
	}
}
