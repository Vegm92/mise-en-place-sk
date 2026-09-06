/**
 * The pure classifiers behind the readiness rows on /admin and /admin/health:
 * DB role, migrations, worker heartbeat/env, queue depth, extraction 24 h,
 * job failures, Stripe webhook freshness, external probes, WhatsApp transport
 * and the web env rows. Each takes data in and returns a HealthCheck, so the
 * thresholds are pinned here without a database.
 */
import { describe, it, expect } from 'vitest';
import { describeDbRole, dbRoleDetail } from '../src/lib/server/db-role';
import {
	dbRoleCheck, envChecks, extractionStatsCheck, formatSeconds, jobFailureCheck, migrationCheck,
	percent, probeCheck, queueDepthDetail, stripeWebhookCheck, whatsAppTransportCheck, workerDetail, workerEnvCheck,
} from '../src/lib/server/system-health';
import { compareMigrations, unreadableMigrationState } from '../src/lib/server/migration-state';
import { workerLiveness, type WorkerHeartbeat } from '../src/lib/server/worker-heartbeat';
import { createWorkerLivenessMonitor, livenessTransition } from '../src/lib/server/worker-liveness-monitor';

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

describe('DB role', () => {
	it('is scoped only when the role is neither owner, superuser nor BYPASSRLS', () => {
		expect(describeDbRole({ role: 'mep_runtime', superuser: false, bypassRls: false, tableOwner: 'postgres' }).scoped).toBe(true);
		expect(describeDbRole({ role: 'postgres', superuser: true, bypassRls: false, tableOwner: 'postgres' }).scoped).toBe(false);
		expect(describeDbRole({ role: 'app', superuser: false, bypassRls: true, tableOwner: 'postgres' }).scoped).toBe(false);
		expect(describeDbRole({ role: 'app', superuser: false, bypassRls: false, tableOwner: 'app' }).scoped).toBe(false);
	});

	it('renders the owner role as a pending cutover, not an error', () => {
		const owner = describeDbRole({ role: 'postgres', superuser: true, bypassRls: false, tableOwner: 'postgres' });
		expect(dbRoleCheck(owner).status).toBe('warn');
		expect(dbRoleDetail(owner)).toContain('#464');
		expect(dbRoleDetail(owner)).toContain('superuser');
		const scoped = describeDbRole({ role: 'mep_runtime', superuser: false, bypassRls: false, tableOwner: 'postgres' });
		expect(dbRoleCheck(scoped)).toMatchObject({ status: 'ok', detail: 'mep_runtime · not table owner (postgres) · RLS active' });
		expect(dbRoleCheck(describeDbRole({ role: '', superuser: false, bypassRls: false, tableOwner: null })).status).toBe('warn');
	});
});

describe('Migrations', () => {
	const journal = [{ idx: 0, tag: '0000_a', when: 1, hash: 'a' }, { idx: 1, tag: '0001_b', when: 2, hash: 'b' }];
	it('is ok when the ledger matches the journal', () => {
		expect(migrationCheck(compareMigrations(journal, [{ createdAt: 1, hash: 'a' }, { createdAt: 2, hash: 'b' }])).status).toBe('ok');
	});
	it('errors on pending, skipped or drifted entries and warns when unreadable', () => {
		expect(migrationCheck(compareMigrations(journal, [{ createdAt: 1, hash: 'a' }])).status).toBe('error');
		expect(migrationCheck(compareMigrations(journal, [{ createdAt: 2, hash: 'b' }])).status).toBe('error');
		expect(migrationCheck(compareMigrations(journal, [{ createdAt: 1, hash: 'x' }, { createdAt: 2, hash: 'b' }])).status).toBe('error');
		expect(migrationCheck(unreadableMigrationState(journal, 'no grant'))).toMatchObject({ status: 'warn', detail: 'no grant' });
	});
});

function heartbeat(seenMsAgo: number, details?: WorkerHeartbeat['details']): WorkerHeartbeat {
	return { id: 'worker', startedAt: new Date(NOW - 3_600_000), lastSeenAt: new Date(NOW - seenMsAgo), lastJobCompletedAt: null, jobsCompleted: 0, details };
}

describe('Worker heartbeat + env', () => {
	it('exposes the heartbeat age and the worker-reported details', () => {
		const details = { release: 'abc123def456789', node: 'v22.0.0', pid: 1, envMissing: [], envRecommended: [] };
		const liveness = workerLiveness(heartbeat(45_000, details), NOW);
		expect(liveness.ageSeconds).toBe(45);
		expect(liveness.details).toEqual(details);
		expect(workerDetail(liveness)).toContain('release abc123def456');
		expect(workerEnvCheck(liveness)).toMatchObject({ status: 'ok' });
	});

	it('turns missing worker variables into an error and recommended ones into a warning', () => {
		const missing = workerLiveness(heartbeat(1_000, { release: null, node: 'v22', pid: 1, envMissing: ['SENTRY_DSN', 'RESEND_API_KEY'], envRecommended: [] }), NOW);
		expect(workerEnvCheck(missing)).toMatchObject({ status: 'error', detail: 'Missing on the worker service: SENTRY_DSN, RESEND_API_KEY' });
		const recommended = workerLiveness(heartbeat(1_000, { release: null, node: 'v22', pid: 1, envMissing: [], envRecommended: ['SENTRY_RELEASE'] }), NOW);
		expect(workerEnvCheck(recommended).status).toBe('warn');
	});

	it('cannot judge env for an old worker build or a worker that never ran', () => {
		expect(workerEnvCheck(workerLiveness(heartbeat(1_000, null), NOW)).status).toBe('warn');
		expect(workerEnvCheck(workerLiveness(null, NOW)).status).toBe('warn');
	});

	it('flags a storage-driver split as an error and a model mismatch as a warning', () => {
		const web = { storageDriver: 'railway', geminiModel: 'gemini-3.1-flash-lite' };
		const base = { release: null, node: 'v22.0.0', pid: 1, envMissing: [], envRecommended: [] };
		const split = workerLiveness(heartbeat(1_000, { ...base, storageDriver: 'local', geminiModel: web.geminiModel }), NOW);
		expect(workerEnvCheck(split, web)).toMatchObject({ status: 'error', detail: expect.stringContaining('web=railway worker=local') });
		const model = workerLiveness(heartbeat(1_000, { ...base, storageDriver: 'railway', geminiModel: 'gemini-2.5-flash' }), NOW);
		expect(workerEnvCheck(model, web)).toMatchObject({ status: 'warn', detail: expect.stringContaining('gemini-2.5-flash') });
		const same = workerLiveness(heartbeat(1_000, { ...base, storageDriver: 'railway', geminiModel: web.geminiModel }), NOW);
		expect(workerEnvCheck(same, web)).toMatchObject({ status: 'ok', detail: expect.stringContaining('storage railway') });
		const older = workerLiveness(heartbeat(1_000, base), NOW);
		expect(workerEnvCheck(older, web).status).toBe('ok');
	});
});

describe('Worker liveness monitor', () => {
	it('fires only on the alive→stale and stale→alive transitions', () => {
		expect(livenessTransition(null, 'alive')).toBeNull();
		expect(livenessTransition(null, 'stale')).toBeNull();
		expect(livenessTransition('alive', 'alive')).toBeNull();
		expect(livenessTransition('alive', 'stale')).toBe('went-stale');
		expect(livenessTransition('stale', 'stale')).toBeNull();
		expect(livenessTransition('stale', 'alive')).toBe('recovered');
		expect(livenessTransition('unknown', 'stale')).toBeNull();
	});

	it('remembers the previous state across checks', async () => {
		const states: Array<'alive' | 'stale'> = ['alive', 'alive', 'stale', 'stale', 'alive'];
		let i = 0;
		const check = createWorkerLivenessMonitor(async () => ({
			state: states[i++]!, lastSeenAt: null, lastJobCompletedAt: null, jobsCompleted: 0, staleAfterSeconds: 120, ageSeconds: 200, details: null,
		}));
		const seen = [];
		for (let n = 0; n < states.length; n++) seen.push(await check());
		expect(seen).toEqual([null, null, 'went-stale', null, 'recovered']);
	});
});

describe('Extraction queue depth', () => {
	it('warns when the oldest queued item is older than two minutes, errors past the stuck threshold', () => {
		const fresh = queueDepthDetail({ items: 2, oldestQueuedAt: new Date(NOW - 30_000).toISOString(), jobs: 2, oldestJobAt: null }, 0, NOW);
		expect(fresh).toEqual({ status: 'ok', detail: '2 in flight · oldest queued 30s ago · 2 pg-boss job(s) pending · none stalled' });
		expect(queueDepthDetail({ items: 1, oldestQueuedAt: new Date(NOW - 300_000).toISOString(), jobs: null, oldestJobAt: null }, 0, NOW).status).toBe('warn');
		expect(queueDepthDetail({ items: 12, oldestQueuedAt: null, jobs: null, oldestJobAt: null }, 11, NOW).status).toBe('error');
	});
});

describe('Extraction 24h', () => {
	const base = { windowHours: 24, timed: 10, p50Seconds: 20, p95Seconds: 60 };
	it('is ok above 90 % success, warns below, errors below 50 % once there is a sample', () => {
		expect(extractionStatsCheck({ ...base, total: 20, succeeded: 19, failed: 1, successRate: 0.95 }).status).toBe('ok');
		expect(extractionStatsCheck({ ...base, total: 20, succeeded: 16, failed: 4, successRate: 0.8 }).status).toBe('warn');
		expect(extractionStatsCheck({ ...base, total: 20, succeeded: 5, failed: 15, successRate: 0.25 }).status).toBe('error');
		expect(extractionStatsCheck({ ...base, total: 2, succeeded: 0, failed: 2, successRate: 0 }).status).toBe('ok');
	});
	it('warns on a slow p95 and describes an empty window', () => {
		expect(extractionStatsCheck({ ...base, p95Seconds: 400, total: 20, succeeded: 20, failed: 0, successRate: 1 }).status).toBe('warn');
		const empty = extractionStatsCheck({ ...base, total: 0, succeeded: 0, failed: 0, successRate: null, timed: 0, p50Seconds: null, p95Seconds: null });
		expect(empty).toMatchObject({ status: 'ok', detail: 'No extractions finished in the last 24 h' });
		expect(extractionStatsCheck({ ...base, total: 20, succeeded: 19, failed: 1, successRate: 0.95 }).detail)
			.toBe('95.0% success (19/20) · p50 20s · p95 60s (10 timed)');
	});
});

describe('Jobs 24h', () => {
	it('warns at 5 % failures and errors at 25 %', () => {
		expect(jobFailureCheck({ windowHours: 24, completed: 100, failed: 0, failureRate: 0 }).status).toBe('ok');
		expect(jobFailureCheck({ windowHours: 24, completed: 95, failed: 5, failureRate: 0.05 }).status).toBe('warn');
		expect(jobFailureCheck({ windowHours: 24, completed: 3, failed: 1, failureRate: 0.25 }).status).toBe('error');
		expect(jobFailureCheck({ windowHours: 24, completed: 0, failed: 0, failureRate: null }).detail).toBe('— failure rate · 0 failed / 0 completed');
	});
});

describe('Stripe webhooks', () => {
	const fresh = { lastReceivedAt: new Date(NOW - 3_600_000).toISOString(), received24h: 3, lastSubscriptionEventAt: null, stripeSubscriptions: 4 };
	it('needs the secret, then a recent event when subscriptions exist', () => {
		expect(stripeWebhookCheck(fresh, false, NOW).status).toBe('warn');
		expect(stripeWebhookCheck(fresh, true, NOW)).toMatchObject({ status: 'ok', detail: 'Last event 60min ago · 3 received in 24 h · 4 Stripe subscription(s)' });
		expect(stripeWebhookCheck({ ...fresh, lastReceivedAt: new Date(NOW - 10 * 86_400_000).toISOString() }, true, NOW).status).toBe('warn');
		expect(stripeWebhookCheck({ ...fresh, lastReceivedAt: new Date(NOW - 10 * 86_400_000).toISOString(), stripeSubscriptions: 0 }, true, NOW).status).toBe('ok');
	});
	it('falls back to the subscription event timestamp once claims have been swept', () => {
		const swept = { ...fresh, lastReceivedAt: null, lastSubscriptionEventAt: new Date(NOW - 7_200_000).toISOString() };
		expect(stripeWebhookCheck(swept, true, NOW).detail).toContain('Last event 2.0h ago');
		expect(stripeWebhookCheck({ ...swept, lastSubscriptionEventAt: null }, true, NOW).status).toBe('warn');
		expect(stripeWebhookCheck({ ...swept, lastSubscriptionEventAt: null, stripeSubscriptions: 0 }, true, NOW).status).toBe('ok');
	});
});

describe('External probes and WhatsApp transport', () => {
	it('maps probe states onto check statuses', () => {
		const at = new Date(NOW).toISOString();
		expect(probeCheck('Gemini', { state: 'ok', detail: 'model reachable', latencyMs: 120, checkedAt: at })).toEqual({ name: 'Gemini', status: 'ok', detail: 'model reachable · 120 ms' });
		expect(probeCheck('Gemini', { state: 'unreachable', detail: '401', latencyMs: 5, checkedAt: at }).status).toBe('error');
		expect(probeCheck('Resend', { state: 'unconfigured', detail: 'Not configured', latencyMs: null, checkedAt: at }, true).status).toBe('error');
		expect(probeCheck('Resend', { state: 'unconfigured', detail: 'Not configured', latencyMs: null, checkedAt: at }, false).status).toBe('warn');
	});

	it('reads the Baileys status flag and asks for a transport when none is configured', () => {
		expect(whatsAppTransportCheck(true, false, 'ready')).toMatchObject({ status: 'ok', detail: 'Baileys socket: ready' });
		expect(whatsAppTransportCheck(true, false, 'logged_out')?.status).toBe('error');
		expect(whatsAppTransportCheck(true, false, null)?.status).toBe('warn');
		expect(whatsAppTransportCheck(false, true, null)).toBeNull();
		expect(whatsAppTransportCheck(false, false, null)?.status).toBe('warn');
	});
});

describe('Env rows and formatting', () => {
	it('lists only the gaps, as errors in production', () => {
		expect(envChecks({ missing: ['SENTRY_DSN'], recommended: ['HEALTH_CHECK_TOKEN'] }, true)).toEqual([
			{ name: 'Env: SENTRY_DSN', status: 'error', detail: 'Missing on the web service' },
			{ name: 'Env: HEALTH_CHECK_TOKEN', status: 'warn', detail: 'Recommended on the web service' },
		]);
		expect(envChecks({ missing: ['SENTRY_DSN'], recommended: [] }, false)[0]!.status).toBe('warn');
		expect(envChecks({ missing: [], recommended: [] }, true)).toEqual([{ name: 'Env (web)', status: 'ok', detail: 'All required variables set' }]);
	});

	it('formats durations and ratios for the detail strings', () => {
		expect(formatSeconds(null)).toBe('—');
		expect(formatSeconds(42)).toBe('42s');
		expect(formatSeconds(600)).toBe('10min');
		expect(formatSeconds(7200)).toBe('2.0h');
		expect(formatSeconds(3 * 86_400)).toBe('3d');
		expect(percent(null)).toBe('—');
		expect(percent(1)).toBe('100%');
		expect(percent(0)).toBe('0%');
		expect(percent(0.876)).toBe('87.6%');
	});
});
