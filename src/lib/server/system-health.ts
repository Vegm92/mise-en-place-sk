import { db } from './db';
import { and, inArray, lt, sql } from 'drizzle-orm';
import { batchItems } from './schema';
import {
	contactsPerTenant,
	getNumberHealth,
	recentAccountEvents,
	type NumberHealth,
} from './whatsapp-health';
import { getIssueSummary, isSentryConfigured } from './sentry-api';
import { pendingDeadLetterCount } from './dead-letter';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const AUTH_ADMIN_EMAIL = process.env.AUTH_ADMIN_EMAIL ?? '';
const AUTH_SECRET = process.env.AUTH_SECRET ?? '';

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

function thresholdStatus(count: number, errorThreshold: number): HealthStatus {
	if (count > errorThreshold) return 'error';
	return count > 0 ? 'warn' : 'ok';
}

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

async function checkDatabase(): Promise<{ checks: HealthCheck[]; ok: boolean }> {
	try {
		await db.execute(sql`SELECT 1`);
		return { checks: [{ name: 'Database', status: 'ok', detail: 'Connection healthy' }], ok: true };
	} catch (e) {
		return { checks: [{ name: 'Database', status: 'error', detail: String(e) }], ok: false };
	}
}

async function checkExtractionQueue(): Promise<{ checks: HealthCheck[]; stuck: number; lastExtraction: string | null }> {
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
		const stuck = stuckRow?.n ?? 0;

		// tenant-scope-ok: platform-wide liveness probe for the admin ops dashboard,
		// same gate as the stuck-item count. Returns a timestamp, no tenant rows.
		const [lastRow] = await db
			.select({ at: sql<string | null>`max(${batchItems.updatedAt})` })
			.from(batchItems)
			.where(inArray(batchItems.status, ['done', 'failed', 'confirmed']));
		const lastExtraction = lastRow?.at ? new Date(lastRow.at).toISOString() : null;

		return {
			stuck,
			lastExtraction,
			checks: [
				{
					name: 'Extraction queue',
					status: thresholdStatus(stuck, STUCK_ERROR_THRESHOLD),
					detail: stuck > 0
						? `${stuck} item(s) stuck in queued/extracting > ${STUCK_MINUTES} min`
						: 'No stalled items',
				},
				{
					name: 'Last extraction',
					status: 'ok',
					detail: lastExtraction ?? 'No extractions yet',
				},
			],
		};
	} catch (e) {
		return { stuck: 0, lastExtraction: null, checks: [{ name: 'Extraction queue', status: 'warn', detail: `Check failed: ${String(e)}` }] };
	}
}

async function checkDeadLetterQueue(): Promise<{ checks: HealthCheck[]; pending: number }> {
	try {
		const pending = await pendingDeadLetterCount();
		return {
			pending,
			checks: [{
				name: 'Dead letter queue',
				status: thresholdStatus(pending, DEAD_LETTER_ERROR_THRESHOLD),
				detail: pending > 0 ? `${pending} record(s) parked for audit` : 'No parked records',
				href: '/admin/dead-letters',
			}],
		};
	} catch (e) {
		return { pending: 0, checks: [{ name: 'Dead letter queue', status: 'warn', detail: `Check failed: ${String(e)}` }] };
	}
}

function whatsAppStatus(health: NumberHealth): HealthStatus {
	if (!health.everReported) return 'warn';
	if (health.severity === 'critical') return 'error';
	if (health.severity === 'warning') return 'warn';
	return 'ok';
}

function whatsAppDetail(health: NumberHealth): string {
	if (!health.everReported) return 'No account events received — subscribe to account_update / phone_number_quality_update';
	return `Quality ${health.qualityRating ?? 'unknown'}`
		+ (health.messagingLimit ? `, limit ${health.messagingLimit}` : '')
		+ (health.lastEvent ? ` · last: ${health.lastEvent}` : '');
}

async function checkWhatsApp(): Promise<{ checks: HealthCheck[]; detail: WhatsAppDetail | null }> {
	try {
		const [health, events, tenants] = await Promise.all([
			getNumberHealth(),
			recentAccountEvents(),
			contactsPerTenant(),
		]);
		return {
			detail: { health, events, tenants },
			checks: [{ name: 'WhatsApp number', status: whatsAppStatus(health), detail: whatsAppDetail(health) }],
		};
	} catch (e) {
		return { detail: null, checks: [{ name: 'WhatsApp number', status: 'warn', detail: `Check failed: ${String(e)}` }] };
	}
}

async function checkSentry(): Promise<{ checks: HealthCheck[]; unresolved: number; critical: number }> {
	if (!isSentryConfigured()) {
		return { unresolved: 0, critical: 0, checks: [{ name: 'Sentry', status: 'warn', detail: 'Not configured (set SENTRY_AUTH_TOKEN and SENTRY_ORG)' }] };
	}
	try {
		const summary = await getIssueSummary();
		const unresolved = summary?.unresolvedCount ?? 0;
		const critical = summary?.criticalCount ?? 0;
		let status: HealthStatus = 'ok';
		if (critical > 0) status = 'error';
		else if (unresolved > 0) status = 'warn';
		return {
			unresolved,
			critical,
			checks: [{
				name: 'Sentry',
				status,
				detail: `${unresolved} unresolved (${critical} critical)`,
				href: '/admin/errors',
			}],
		};
	} catch (e) {
		return { unresolved: 0, critical: 0, checks: [{ name: 'Sentry', status: 'warn', detail: `Check failed: ${String(e)}` }] };
	}
}

function checkEnvVars(): HealthCheck[] {
	const envMap: Record<string, string> = { DATABASE_URL, GEMINI_API_KEY, AUTH_ADMIN_EMAIL, AUTH_SECRET };
	return REQUIRED_VARS.map(varName => ({
		name: `Env: ${varName}`,
		status: envMap[varName] ? 'ok' : 'warn',
		detail: envMap[varName] ? 'Set' : 'Missing',
	}));
}

export async function runSystemChecks(): Promise<SystemHealth> {
	const db_ = await checkDatabase();
	const checks: HealthCheck[] = [...db_.checks];

	let stuck = 0;
	let lastExtraction: string | null = null;
	let whatsapp: WhatsAppDetail | null = null;
	let unresolved = 0;
	let critical = 0;
	let pendingDeadLetters = 0;

	if (db_.ok) {
		const [queue, deadLetter, wa] = await Promise.all([
			checkExtractionQueue(),
			checkDeadLetterQueue(),
			checkWhatsApp(),
		]);
		checks.push(...queue.checks, ...deadLetter.checks, ...wa.checks);
		stuck = queue.stuck;
		lastExtraction = queue.lastExtraction;
		pendingDeadLetters = deadLetter.pending;
		whatsapp = wa.detail;
	}

	const sentry = await checkSentry();
	checks.push(...sentry.checks);
	unresolved = sentry.unresolved;
	critical = sentry.critical;

	checks.push(...checkEnvVars());

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
