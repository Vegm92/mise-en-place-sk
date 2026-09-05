import { db } from './db';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { batchItems, restaurants } from './schema';
import {
	contactsPerTenant,
	getNumberHealth,
	recentAccountEvents,
	type NumberHealth,
} from './whatsapp-health';
import { getIssueSummary, isSentryConfigured } from './sentry-api';
import { pendingDeadLetterCount } from './dead-letter';
import { TENANT_FANOUT_QUEUES } from './alerts';
import { lastJobRuns, type JobRunSummary } from './tenant-fanout';
import { readWorkerHeartbeat, workerLiveness, type WorkerLiveness } from './worker-heartbeat';
import { dbRoleDetail, readDbRole, type DbRoleInfo } from './db-role';
import { describeMigrationState, migrationState, type MigrationState } from './migration-state';
import { envGaps, type EnvGaps } from './env-report';
import {
	extractionQueueDepth, extractionStats, jobFailureStats, pendingAccessCount, stripeWebhookFreshness,
	type ExtractionStats, type JobFailureStats, type QueueDepth, type StripeWebhookFreshness,
} from './pipeline-stats';
import { probeGemini, probeResend, probeStripe, probeWhatsAppCloud, type ProbeResult } from './external-probes';
import { getFlag } from './app-flags';
import { WHATSAPP_STATUS_FLAG } from './integrations/whatsapp/runtime';
import {
	GEMINI_MODEL, STORAGE_DRIVER, WHATSAPP_ACCESS_TOKEN, WHATSAPP_BOT_ENABLED, WHATSAPP_PHONE_NUMBER_ID,
} from './env';

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';

const STUCK_MINUTES = 15;
const STUCK_ERROR_THRESHOLD = 10;
const DEAD_LETTER_ERROR_THRESHOLD = 25;
const TENANT_JOB_FAILURE_ERROR_THRESHOLD = 10;
const TENANT_JOB_WINDOW_HOURS = 24;
const EXTRACTION_MIN_SAMPLE = 5;
const EXTRACTION_SUCCESS_WARN = 0.9;
const EXTRACTION_SUCCESS_ERROR = 0.5;
const EXTRACTION_P95_WARN_SECONDS = 300;
const JOB_FAILURE_WARN = 0.05;
const JOB_FAILURE_ERROR = 0.25;
const QUEUE_OLDEST_WARN_SECONDS = 120;
const STRIPE_WEBHOOK_SILENCE_WARN_DAYS = 7;

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

export interface TenantJobStats {
	queue: string;
	pending: number;
	completed: number;
	failed: number;
	sent: number;
}

export interface ScheduledJobHealth {
	queues: TenantJobStats[];
	runs: JobRunSummary[];
}

export interface ReadinessGates {
	dbRole: HealthStatus;
	migrations: HealthStatus;
	worker: HealthStatus;
}

export interface ExternalProbes {
	gemini: ProbeResult | null;
	stripe: ProbeResult | null;
	resend: ProbeResult | null;
	whatsappCloud: ProbeResult | null;
}

export interface SystemHealth {
	checks: HealthCheck[];
	overall: HealthStatus;
	gates: ReadinessGates;
	whatsapp: WhatsAppDetail | null;
	sentry: { configured: boolean; unresolved: number; critical: number; events24h: number };
	queue: { stuck: number; lastExtraction: string | null; depth: QueueDepth | null };
	extraction: ExtractionStats | null;
	jobs: JobFailureStats | null;
	scheduledJobs: ScheduledJobHealth;
	worker: WorkerLiveness;
	deadLetters: { pending: number };
	dbRole: DbRoleInfo | null;
	migrations: MigrationState | null;
	stripeWebhooks: StripeWebhookFreshness | null;
	access: { pending: number };
	env: EnvGaps;
	probes: ExternalProbes;
	checkedAt: string;
}

function worst(checks: HealthCheck[]): HealthStatus {
	if (checks.some(c => c.status === 'error')) return 'error';
	if (checks.some(c => c.status === 'warn')) return 'warn';
	return 'ok';
}

function failedCheck(name: string, e: unknown): HealthCheck {
	return { name, status: 'warn', detail: `Check failed: ${String(e)}` };
}

export function formatSeconds(seconds: number | null): string {
	if (seconds === null) return '—';
	if (seconds < 90) return `${Math.round(seconds)}s`;
	if (seconds < 5400) return `${Math.round(seconds / 60)}min`;
	if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)}h`;
	return `${Math.round(seconds / 86_400)}d`;
}

function ageSeconds(iso: string | null, now = Date.now()): number | null {
	return iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)) : null;
}

export function percent(ratio: number | null): string {
	return ratio === null ? '—' : `${(ratio * 100).toFixed(ratio >= 0.995 || ratio === 0 ? 0 : 1)}%`;
}

async function checkDatabase(): Promise<{ checks: HealthCheck[]; ok: boolean }> {
	try {
		await db.execute(sql`SELECT 1`);
		return { checks: [{ name: 'Database', status: 'ok', detail: 'Connection healthy' }], ok: true };
	} catch (e) {
		return { checks: [{ name: 'Database', status: 'error', detail: String(e) }], ok: false };
	}
}

export function dbRoleCheck(info: DbRoleInfo): HealthCheck {
	return {
		name: 'DB role',
		status: !info.role ? 'warn' : info.scoped ? 'ok' : 'warn',
		detail: dbRoleDetail(info),
	};
}

async function checkDbRole(): Promise<{ checks: HealthCheck[]; dbRole: DbRoleInfo | null }> {
	try {
		const dbRole = await readDbRole();
		return { dbRole, checks: [dbRoleCheck(dbRole)] };
	} catch (e) {
		return { dbRole: null, checks: [failedCheck('DB role', e)] };
	}
}

export function migrationCheck(state: MigrationState): HealthCheck {
	let status: HealthStatus = 'ok';
	if (!state.readable) status = 'warn';
	else if (state.skipped.length || state.pending.length || state.drifted.length) status = 'error';
	return { name: 'Migrations', status, detail: describeMigrationState(state) };
}

async function checkMigrations(): Promise<{ checks: HealthCheck[]; migrations: MigrationState | null }> {
	try {
		const migrations = await migrationState();
		return { migrations, checks: [migrationCheck(migrations)] };
	} catch (e) {
		return { migrations: null, checks: [failedCheck('Migrations', e)] };
	}
}

const WORKER_STATUS: Record<WorkerLiveness['state'], HealthStatus> = {
	alive: 'ok',
	stale: 'error',
	unknown: 'warn',
};

export function workerDetail(worker: WorkerLiveness): string {
	if (worker.state === 'unknown') {
		return 'No heartbeat recorded — the worker process has never started against this database';
	}
	const jobs = worker.lastJobCompletedAt
		? `last job ${formatSeconds(ageSeconds(worker.lastJobCompletedAt))} ago (${worker.jobsCompleted} total)`
		: 'no job completed yet';
	const seen = `last seen ${formatSeconds(worker.ageSeconds)} ago`;
	const release = worker.details?.release ? ` · release ${worker.details.release.slice(0, 12)}` : '';
	return worker.state === 'alive'
		? `Alive · ${seen} · ${jobs}${release}`
		: `No heartbeat for over ${worker.staleAfterSeconds}s — worker is down or wedged · ${seen} · ${jobs}${release}`;
}

export interface WebProcessConfig {
	storageDriver: string;
	geminiModel: string;
}

export function webProcessConfig(): WebProcessConfig {
	return { storageDriver: STORAGE_DRIVER, geminiModel: GEMINI_MODEL };
}

export function workerEnvCheck(worker: WorkerLiveness, web: WebProcessConfig = webProcessConfig()): HealthCheck {
	if (worker.state === 'unknown') {
		return { name: 'Worker env', status: 'warn', detail: 'Unknown until the worker reports a heartbeat' };
	}
	const details = worker.details;
	if (!details) {
		return { name: 'Worker env', status: 'warn', detail: 'Worker build predates env reporting — redeploy the worker' };
	}
	if (details.envMissing.length > 0) {
		return { name: 'Worker env', status: 'error', detail: `Missing on the worker service: ${details.envMissing.join(', ')}` };
	}
	if (details.storageDriver !== undefined && details.storageDriver !== web.storageDriver) {
		return {
			name: 'Worker env',
			status: 'error',
			detail: `Storage driver split: web=${web.storageDriver} worker=${details.storageDriver} — the worker cannot read what the web uploads, every extraction fails`,
		};
	}
	if (details.envRecommended.length > 0) {
		return { name: 'Worker env', status: 'warn', detail: `Recommended on the worker service: ${details.envRecommended.join(', ')}` };
	}
	if (details.geminiModel !== undefined && details.geminiModel !== web.geminiModel) {
		return {
			name: 'Worker env',
			status: 'warn',
			detail: `Gemini model differs: web=${web.geminiModel} worker=${details.geminiModel} — extraction and chat/digest run on different models`,
		};
	}
	const same = details.storageDriver === undefined
		? ''
		: ` · storage ${details.storageDriver} · ${details.geminiModel ?? web.geminiModel}, same as web`;
	return { name: 'Worker env', status: 'ok', detail: `All required variables set · node ${details.node}${same}` };
}

async function checkWorkerHeartbeat(): Promise<{ checks: HealthCheck[]; worker: WorkerLiveness }> {
	try {
		const worker = workerLiveness(await readWorkerHeartbeat());
		return {
			worker,
			checks: [
				{ name: 'Worker heartbeat', status: WORKER_STATUS[worker.state], detail: workerDetail(worker) },
				workerEnvCheck(worker),
			],
		};
	} catch (e) {
		return { worker: workerLiveness(null), checks: [failedCheck('Worker heartbeat', e)] };
	}
}

export function queueDepthDetail(depth: QueueDepth, stuck: number, now = Date.now()): { status: HealthStatus; detail: string } {
	const oldest = ageSeconds(depth.oldestQueuedAt, now);
	const parts = [`${depth.items} in flight`];
	if (oldest !== null) parts.push(`oldest queued ${formatSeconds(oldest)} ago`);
	if (depth.jobs !== null) parts.push(`${depth.jobs} pg-boss job(s) pending`);
	parts.push(stuck > 0 ? `${stuck} stalled > ${STUCK_MINUTES} min` : 'none stalled');
	let status = thresholdStatus(stuck, STUCK_ERROR_THRESHOLD);
	if (status === 'ok' && oldest !== null && oldest > QUEUE_OLDEST_WARN_SECONDS) status = 'warn';
	return { status, detail: parts.join(' · ') };
}

async function checkExtractionQueue(): Promise<{ checks: HealthCheck[]; stuck: number; lastExtraction: string | null; depth: QueueDepth | null }> {
	try {
		const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
		// tenant-scope-ok: platform-wide queue health for the admin ops dashboard —
		// a per-tenant count would hide a stalled worker. Returns a bare count, no rows.
		const stuck = await db.$count(batchItems, and(
			inArray(batchItems.status, ['queued', 'extracting']),
			lt(batchItems.updatedAt, cutoff),
		));

		// tenant-scope-ok: platform-wide liveness probe for the admin ops dashboard,
		// same gate as the stuck-item count. Returns a timestamp, no tenant rows.
		const [lastRow] = await db
			.select({ at: sql<string | null>`max(${batchItems.updatedAt})` })
			.from(batchItems)
			.where(inArray(batchItems.status, ['done', 'failed', 'confirmed']));
		const lastExtraction = lastRow?.at ? new Date(lastRow.at).toISOString() : null;
		const depth = await extractionQueueDepth();
		const queue = queueDepthDetail(depth, stuck);

		return {
			stuck,
			lastExtraction,
			depth,
			checks: [
				{ name: 'Extraction queue', status: queue.status, detail: queue.detail },
				{ name: 'Last extraction', status: 'ok', detail: lastExtraction ? `${formatSeconds(ageSeconds(lastExtraction))} ago` : 'No extractions yet' },
			],
		};
	} catch (e) {
		return { stuck: 0, lastExtraction: null, depth: null, checks: [failedCheck('Extraction queue', e)] };
	}
}

export function extractionStatsCheck(stats: ExtractionStats): HealthCheck {
	let status: HealthStatus = 'ok';
	if (stats.total >= EXTRACTION_MIN_SAMPLE && stats.successRate !== null) {
		if (stats.successRate < EXTRACTION_SUCCESS_ERROR) status = 'error';
		else if (stats.successRate < EXTRACTION_SUCCESS_WARN) status = 'warn';
	}
	if (status === 'ok' && stats.p95Seconds !== null && stats.p95Seconds > EXTRACTION_P95_WARN_SECONDS) status = 'warn';
	const detail = stats.total === 0
		? `No extractions finished in the last ${stats.windowHours} h`
		: `${percent(stats.successRate)} success (${stats.succeeded}/${stats.total}) · p50 ${formatSeconds(stats.p50Seconds)} · p95 ${formatSeconds(stats.p95Seconds)} (${stats.timed} timed)`;
	return { name: `Extraction ${stats.windowHours}h`, status, detail };
}

async function checkExtractionStats(): Promise<{ checks: HealthCheck[]; extraction: ExtractionStats | null }> {
	try {
		const extraction = await extractionStats();
		return { extraction, checks: [extractionStatsCheck(extraction)] };
	} catch (e) {
		return { extraction: null, checks: [failedCheck('Extraction 24h', e)] };
	}
}

export function jobFailureCheck(stats: JobFailureStats): HealthCheck {
	let status: HealthStatus = 'ok';
	if (stats.failureRate !== null) {
		if (stats.failureRate >= JOB_FAILURE_ERROR) status = 'error';
		else if (stats.failureRate >= JOB_FAILURE_WARN) status = 'warn';
	}
	return {
		name: `Jobs ${stats.windowHours}h`,
		status,
		detail: `${percent(stats.failureRate)} failure rate · ${stats.failed} failed / ${stats.completed} completed`,
	};
}

async function checkJobs(): Promise<{ checks: HealthCheck[]; jobs: JobFailureStats | null }> {
	try {
		const jobs = await jobFailureStats();
		return { jobs, checks: [jobFailureCheck(jobs)] };
	} catch (e) {
		return { jobs: null, checks: [failedCheck('Jobs 24h', e)] };
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
		return { pending: 0, checks: [failedCheck('Dead letter queue', e)] };
	}
}

async function tenantJobStats(): Promise<TenantJobStats[]> {
	const names = sql.join(TENANT_FANOUT_QUEUES.map(q => sql`${q}`), sql`, `);
	const rows = await db.execute(sql`
		SELECT name,
			COUNT(*) FILTER (WHERE state IN ('created', 'retry', 'active'))::int AS pending,
			COUNT(*) FILTER (WHERE state = 'completed')::int AS completed,
			COUNT(*) FILTER (WHERE state = 'failed')::int AS failed,
			COUNT(*) FILTER (WHERE state = 'completed' AND output->>'sent' = 'true')::int AS sent
		FROM pgboss.job
		WHERE name IN (${names})
			AND created_on > now() - ${`${TENANT_JOB_WINDOW_HOURS} hours`}::interval
		GROUP BY name
	`);
	return (rows as unknown as Array<Record<string, unknown>>).map(r => ({
		queue: String(r.name),
		pending: Number(r.pending ?? 0),
		completed: Number(r.completed ?? 0),
		failed: Number(r.failed ?? 0),
		sent: Number(r.sent ?? 0),
	}));
}

function jobRunDetail(run: JobRunSummary): string {
	return `${run.dispatched} of ${run.considered} eligible tenant(s) queued`
		+ ` (${run.scanned} scanned) · ${run.at}`;
}

async function checkScheduledJobs(): Promise<{ checks: HealthCheck[]; detail: ScheduledJobHealth }> {
	try {
		const [queues, runs] = await Promise.all([tenantJobStats(), lastJobRuns()]);
		const failed = queues.reduce((n, q) => n + q.failed, 0);
		const pending = queues.reduce((n, q) => n + q.pending, 0);
		const completed = queues.reduce((n, q) => n + q.completed, 0);
		const sent = queues.reduce((n, q) => n + q.sent, 0);

		const checks: HealthCheck[] = [{
			name: 'Per-tenant jobs',
			status: thresholdStatus(failed, TENANT_JOB_FAILURE_ERROR_THRESHOLD),
			detail: `${completed} done (${sent} sent), ${pending} pending, ${failed} failed in the last ${TENANT_JOB_WINDOW_HOURS} h`,
		}];
		for (const run of runs.sort((a, b) => a.label.localeCompare(b.label))) {
			checks.push({ name: `Dispatch: ${run.label}`, status: 'ok', detail: jobRunDetail(run) });
		}

		return { checks, detail: { queues, runs } };
	} catch (e) {
		return { checks: [failedCheck('Per-tenant jobs', e)], detail: { queues: [], runs: [] } };
	}
}

export function stripeWebhookCheck(fresh: StripeWebhookFreshness, configured: boolean, now = Date.now()): HealthCheck {
	if (!configured) return { name: 'Stripe webhooks', status: 'warn', detail: 'STRIPE_WEBHOOK_SECRET not set — webhooks are rejected' };
	const last = fresh.lastReceivedAt ?? fresh.lastSubscriptionEventAt;
	const age = ageSeconds(last, now);
	const received = `${fresh.received24h} received in 24 h`;
	if (last === null) {
		return {
			name: 'Stripe webhooks',
			status: fresh.stripeSubscriptions > 0 ? 'warn' : 'ok',
			detail: fresh.stripeSubscriptions > 0
				? `Never received, yet ${fresh.stripeSubscriptions} subscription(s) live in Stripe — check the endpoint`
				: 'None received yet (no Stripe subscriptions either)',
		};
	}
	const silent = age !== null && age > STRIPE_WEBHOOK_SILENCE_WARN_DAYS * 86_400 && fresh.stripeSubscriptions > 0;
	return {
		name: 'Stripe webhooks',
		status: silent ? 'warn' : 'ok',
		detail: `Last event ${formatSeconds(age)} ago · ${received} · ${fresh.stripeSubscriptions} Stripe subscription(s)`,
	};
}

async function checkStripeWebhooks(): Promise<{ checks: HealthCheck[]; fresh: StripeWebhookFreshness | null }> {
	try {
		const fresh = await stripeWebhookFreshness();
		return { fresh, checks: [stripeWebhookCheck(fresh, Boolean(process.env.STRIPE_WEBHOOK_SECRET))] };
	} catch (e) {
		return { fresh: null, checks: [failedCheck('Stripe webhooks', e)] };
	}
}

export function probeCheck(name: string, probe: ProbeResult, missingIsError = false): HealthCheck {
	if (probe.state === 'unconfigured') return { name, status: missingIsError ? 'error' : 'warn', detail: probe.detail };
	if (probe.state === 'unreachable') return { name, status: 'error', detail: `Unreachable: ${probe.detail}` };
	return { name, status: 'ok', detail: `${probe.detail}${probe.latencyMs !== null ? ` · ${probe.latencyMs} ms` : ''}` };
}

async function checkProbes(): Promise<{ checks: HealthCheck[]; probes: ExternalProbes }> {
	const production = NODE_ENV === 'production';
	const [gemini, stripe, resend, whatsappCloud] = await Promise.all([
		probeGemini(), probeStripe(), probeResend(), probeWhatsAppCloud(),
	]);
	const checks = [
		probeCheck('Gemini', gemini, true),
		probeCheck('Stripe API', stripe, production),
		probeCheck('Resend', resend, production),
	];
	if (whatsappCloud.state !== 'unconfigured') checks.push(probeCheck('WhatsApp Cloud API', whatsappCloud, false));
	return { checks, probes: { gemini, stripe, resend, whatsappCloud } };
}

const TRANSPORT_STATUS: Record<string, HealthStatus> = {
	ready: 'ok', connecting: 'warn', pairing: 'warn', reconnecting: 'warn', logged_out: 'error', unreachable: 'error',
};

export function whatsAppTransportCheck(botEnabled: boolean, cloudConfigured: boolean, flag: string | null): HealthCheck | null {
	if (botEnabled) {
		const status = flag ? (TRANSPORT_STATUS[flag] ?? 'warn') : 'warn';
		return { name: 'WhatsApp transport', status, detail: flag ? `Baileys socket: ${flag}` : 'Baileys enabled, no status reported yet', href: '/admin/whatsapp' };
	}
	if (cloudConfigured) return null;
	return { name: 'WhatsApp transport', status: 'warn', detail: 'No transport configured — set WHATSAPP_BOT_ENABLED=true on the worker or the Cloud API variables', href: '/admin/whatsapp' };
}

async function checkWhatsAppTransport(): Promise<HealthCheck[]> {
	try {
		const botEnabled = WHATSAPP_BOT_ENABLED === 'true';
		const flag = botEnabled ? await getFlag(WHATSAPP_STATUS_FLAG) : null;
		const check = whatsAppTransportCheck(botEnabled, Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID), flag);
		return check ? [check] : [];
	} catch (e) {
		return [failedCheck('WhatsApp transport', e)];
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
		return { detail: null, checks: [failedCheck('WhatsApp number', e)] };
	}
}

async function checkSentry(): Promise<{ checks: HealthCheck[]; unresolved: number; critical: number; events24h: number }> {
	if (!isSentryConfigured()) {
		return { unresolved: 0, critical: 0, events24h: 0, checks: [{ name: 'Sentry', status: 'warn', detail: 'Not configured (set SENTRY_AUTH_TOKEN and SENTRY_ORG)' }] };
	}
	try {
		const summary = await getIssueSummary();
		const unresolved = summary?.unresolvedCount ?? 0;
		const critical = summary?.criticalCount ?? 0;
		const events24h = summary?.events24h ?? 0;
		let status: HealthStatus = 'ok';
		if (critical > 0) status = 'error';
		else if (unresolved > 0) status = 'warn';
		return {
			unresolved,
			critical,
			events24h,
			checks: [{
				name: 'Sentry',
				status,
				detail: `${unresolved} unresolved (${critical} critical) · ${events24h} event(s) in 24 h`,
				href: '/admin/errors',
			}],
		};
	} catch (e) {
		return { unresolved: 0, critical: 0, events24h: 0, checks: [failedCheck('Sentry', e)] };
	}
}

async function checkAccess(): Promise<{ checks: HealthCheck[]; pending: number }> {
	try {
		const pending = await pendingAccessCount();
		return {
			pending,
			checks: [{
				name: 'Access requests',
				status: pending > 0 ? 'warn' : 'ok',
				detail: pending > 0 ? `${pending} account(s) waiting for approval` : 'No accounts waiting',
				href: '/admin/access',
			}],
		};
	} catch (e) {
		return { pending: 0, checks: [failedCheck('Access requests', e)] };
	}
}

export function envChecks(gaps: EnvGaps, production = NODE_ENV === 'production'): HealthCheck[] {
	const checks: HealthCheck[] = gaps.missing.map(name => ({
		name: `Env: ${name}`,
		status: production ? 'error' : 'warn',
		detail: 'Missing on the web service',
	}));
	for (const name of gaps.recommended) {
		checks.push({ name: `Env: ${name}`, status: 'warn', detail: 'Recommended on the web service' });
	}
	if (checks.length === 0) checks.push({ name: 'Env (web)', status: 'ok', detail: 'All required variables set' });
	return checks;
}

function gateStatus(checks: HealthCheck[], name: string): HealthStatus {
	return checks.find(c => c.name === name)?.status ?? 'warn';
}

export async function runSystemChecks(): Promise<SystemHealth> {
	const db_ = await checkDatabase();
	const checks: HealthCheck[] = [...db_.checks];

	let stuck = 0;
	let lastExtraction: string | null = null;
	let depth: QueueDepth | null = null;
	let whatsapp: WhatsAppDetail | null = null;
	let pendingDeadLetters = 0;
	let scheduledJobs: ScheduledJobHealth = { queues: [], runs: [] };
	let worker = workerLiveness(null);
	let dbRole: DbRoleInfo | null = null;
	let migrations: MigrationState | null = null;
	let extraction: ExtractionStats | null = null;
	let jobs: JobFailureStats | null = null;
	let stripeWebhooks: StripeWebhookFreshness | null = null;
	let pendingAccess = 0;

	if (db_.ok) {
		const [role, mig, heartbeat, queue, stats, jobStats, deadLetter, scheduled, stripeHooks, access, wa, transport] = await Promise.all([
			checkDbRole(),
			checkMigrations(),
			checkWorkerHeartbeat(),
			checkExtractionQueue(),
			checkExtractionStats(),
			checkJobs(),
			checkDeadLetterQueue(),
			checkScheduledJobs(),
			checkStripeWebhooks(),
			checkAccess(),
			checkWhatsApp(),
			checkWhatsAppTransport(),
		]);
		checks.push(
			...role.checks, ...mig.checks, ...heartbeat.checks, ...queue.checks, ...stats.checks, ...jobStats.checks,
			...deadLetter.checks, ...scheduled.checks, ...stripeHooks.checks, ...access.checks, ...wa.checks, ...transport,
		);
		dbRole = role.dbRole;
		migrations = mig.migrations;
		worker = heartbeat.worker;
		stuck = queue.stuck;
		lastExtraction = queue.lastExtraction;
		depth = queue.depth;
		extraction = stats.extraction;
		jobs = jobStats.jobs;
		pendingDeadLetters = deadLetter.pending;
		scheduledJobs = scheduled.detail;
		stripeWebhooks = stripeHooks.fresh;
		pendingAccess = access.pending;
		whatsapp = wa.detail;
	}

	const [probes, sentry] = await Promise.all([checkProbes(), checkSentry()]);
	checks.push(...probes.checks, ...sentry.checks);

	const env = envGaps('web');
	checks.push(...envChecks(env));

	return {
		checks,
		overall: worst(checks),
		gates: {
			dbRole: gateStatus(checks, 'DB role'),
			migrations: gateStatus(checks, 'Migrations'),
			worker: gateStatus(checks, 'Worker heartbeat'),
		},
		whatsapp,
		sentry: { configured: isSentryConfigured(), unresolved: sentry.unresolved, critical: sentry.critical, events24h: sentry.events24h },
		queue: { stuck, lastExtraction, depth },
		extraction,
		jobs,
		scheduledJobs,
		worker,
		deadLetters: { pending: pendingDeadLetters },
		dbRole,
		migrations,
		stripeWebhooks,
		access: { pending: pendingAccess },
		env,
		probes: probes.probes,
		checkedAt: new Date().toISOString(),
	};
}

export interface StuckItem {
	id: string;
	restaurantId: string;
	restaurantName: string | null;
	displayName: string;
	status: string;
	queuedAt: string | null;
	updatedAt: string;
}

export async function stuckBatchItems(limit = 25): Promise<StuckItem[]> {
	const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
	// tenant-scope-ok: admin ops dashboard listing of every tenant's stalled
	// extractions, same gate as the aggregate stuck count above.
	const rows = await db
		.select({
			id: batchItems.id,
			restaurantId: batchItems.restaurantId,
			restaurantName: restaurants.name,
			displayName: batchItems.displayName,
			status: batchItems.status,
			queuedAt: batchItems.queuedAt,
			updatedAt: batchItems.updatedAt,
		})
		.from(batchItems)
		.leftJoin(restaurants, eq(restaurants.id, batchItems.restaurantId))
		.where(and(
			inArray(batchItems.status, ['queued', 'extracting']),
			lt(batchItems.updatedAt, cutoff),
		))
		.orderBy(asc(batchItems.updatedAt))
		.limit(limit);
	return rows.map(r => ({
		...r,
		queuedAt: r.queuedAt ? new Date(r.queuedAt).toISOString() : null,
		updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : cutoff.toISOString(),
	}));
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
