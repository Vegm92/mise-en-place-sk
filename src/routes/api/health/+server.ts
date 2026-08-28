import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql, gt, and, inArray } from 'drizzle-orm';
import { batchItems } from '$lib/server/schema';
import { STORAGE_DRIVER, UPLOADS_DIR, HEALTH_CHECK_TOKEN, HEALTH_RATE_LIMIT_RPM } from '$lib/server/env';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { version } from '$app/environment';
import { readWorkerHeartbeat, workerLiveness } from '$lib/server/worker-heartbeat';
import { isAdminUser } from '$lib/server/admin';
import { checkRateLimit, getExtractionSemaphoreStatus } from '$lib/server/rate-limiter';

const START_TIME = Date.now();
const HEALTH_TOKEN_HEADER = 'x-health-token';

async function isDbReachable(): Promise<boolean> {
	try {
		await db.execute(sql`SELECT 1`);
		return true;
	} catch {
		return false;
	}
}

function hasValidHealthToken(request: Request): boolean {
	if (!HEALTH_CHECK_TOKEN) return false;
	const provided = request.headers.get(HEALTH_TOKEN_HEADER) ?? '';
	const expected = Buffer.from(HEALTH_CHECK_TOKEN);
	const actual = Buffer.from(provided);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function computeHealthDetail() {
	let dbReachable = false;
	let dbSizeMb = 0;
	try {
		const [, sizeRows] = await Promise.all([
			db.execute(sql`SELECT 1`),
			db.execute(sql`SELECT pg_database_size(current_database()) AS size`),
		]);
		dbReachable = true;
		const raw = (sizeRows as unknown as Array<{ size: string | number }>)[0]?.size;
		dbSizeMb = Math.round(Number(raw ?? 0) / (1024 * 1024));
	} catch { }

	let queue: { reachable: boolean; pending: number } = { reachable: false, pending: 0 };
	try {
		const rows = await db.execute(
			sql`SELECT COUNT(*)::int AS pending FROM pgboss.job
			    WHERE name = 'extract-invoice' AND state IN ('created', 'active', 'retry')`
		);
		const pending = (rows as unknown as Array<{ pending: number }>)[0]?.pending ?? 0;
		queue = { reachable: true, pending: Number(pending) };
	} catch { }

	let liveness = workerLiveness(null);
	try {
		liveness = workerLiveness(await readWorkerHeartbeat());
	} catch { }

	let activeCount = 0;
	try {
		const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
		// tenant-scope-ok: system-wide queue-depth probe for /api/health, deliberately cross-tenant
		const rows = await db
			.select({ cnt: sql<number>`COUNT(*)` })
			.from(batchItems)
			.where(and(
				inArray(batchItems.status, ['queued', 'extracting']),
				gt(batchItems.updatedAt, cutoff),
			));
		activeCount = Number(rows[0]?.cnt ?? 0);
	} catch { }

	let uploadsDir: { writable: boolean; free_mb: number } | null = null;
	if (STORAGE_DRIVER === 'local') {
		const dir = path.resolve(process.cwd(), UPLOADS_DIR);
		let writable = false;
		let freeMb = 0;
		try {
			fs.accessSync(dir, fs.constants.W_OK);
			writable = true;
		} catch { }
		try {
			const stat = (fs as unknown as { statfsSync?: (p: string) => { bfree: number; bsize: number } })
				.statfsSync?.(dir);
			if (stat) freeMb = Math.round((stat.bfree * stat.bsize) / (1024 * 1024));
		} catch { }
		uploadsDir = { writable, free_mb: freeMb };
	}

	const degraded = !dbReachable || uploadsDir?.writable === false;

	return {
		status: degraded ? 'degraded' as const : 'ok' as const,
		db: { reachable: dbReachable, size_mb: dbSizeMb },
		worker: {
			...queue,
			liveness: liveness.state,
			last_seen_at: liveness.lastSeenAt,
			last_job_completed_at: liveness.lastJobCompletedAt,
			jobs_completed: liveness.jobsCompleted,
			stale_after_seconds: liveness.staleAfterSeconds,
		},
		uploads_dir: uploadsDir,
		sessions: { active_count: activeCount },
		extraction_semaphore: getExtractionSemaphoreStatus(),
		uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
		version,
	};
}

export const GET: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const ip = getClientAddress();
	if (!(await checkRateLimit(`health:${ip}`, HEALTH_RATE_LIMIT_RPM))) {
		return json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
	}

	const wantsDetail = isAdminUser(locals.user) || hasValidHealthToken(request);

	if (!wantsDetail) {
		const dbReachable = await isDbReachable();
		return json(
			{ status: dbReachable ? 'ok' as const : 'degraded' as const },
			{ status: dbReachable ? 200 : 503 },
		);
	}

	const detail = await computeHealthDetail();
	return json(detail, { status: detail.status === 'ok' ? 200 : 503 });
};
