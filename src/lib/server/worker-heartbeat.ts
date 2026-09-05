import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { workerHeartbeats, type WorkerHeartbeatDetails } from './schema';
import { SENTRY_RELEASE, WORKER_HEARTBEAT_INTERVAL_MS, WORKER_HEARTBEAT_STALE_MS } from './env';
import { envGaps } from './env-report';

export const WORKER_ID = 'worker';

export interface WorkerHeartbeat {
	id: string;
	startedAt: Date;
	lastSeenAt: Date;
	lastJobCompletedAt: Date | null;
	jobsCompleted: number;
	details?: WorkerHeartbeatDetails | null;
}

export type WorkerLivenessState = 'alive' | 'stale' | 'unknown';

export interface WorkerLiveness {
	state: WorkerLivenessState;
	lastSeenAt: string | null;
	lastJobCompletedAt: string | null;
	jobsCompleted: number;
	staleAfterSeconds: number;
	ageSeconds: number | null;
	details: WorkerHeartbeatDetails | null;
}

export function workerBootDetails(env: NodeJS.ProcessEnv = process.env): WorkerHeartbeatDetails {
	const gaps = envGaps('worker', env);
	return {
		release: SENTRY_RELEASE || null,
		node: process.version,
		pid: process.pid,
		envMissing: gaps.missing,
		envRecommended: gaps.recommended,
	};
}

export async function recordWorkerHeartbeat(jobsCompleted = 0, details?: WorkerHeartbeatDetails): Promise<void> {
	const now = new Date();
	await db
		.insert(workerHeartbeats)
		.values({
			id: WORKER_ID,
			startedAt: now,
			lastSeenAt: now,
			lastJobCompletedAt: jobsCompleted > 0 ? now : null,
			jobsCompleted,
			details: details ?? null,
		})
		.onConflictDoUpdate({
			target: workerHeartbeats.id,
			set: {
				lastSeenAt: now,
				lastJobCompletedAt: jobsCompleted > 0
					? now
					: sql`${workerHeartbeats.lastJobCompletedAt}`,
				jobsCompleted: sql`${workerHeartbeats.jobsCompleted} + ${jobsCompleted}`,
				...(details ? { startedAt: now, details } : {}),
			},
		});
}

export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
	const rows = await db
		.select()
		.from(workerHeartbeats)
		.where(eq(workerHeartbeats.id, WORKER_ID))
		.limit(1);
	return (rows[0] as WorkerHeartbeat | undefined) ?? null;
}

export function workerLiveness(
	heartbeat: WorkerHeartbeat | null,
	now = Date.now(),
): WorkerLiveness {
	const staleAfterSeconds = Math.round(WORKER_HEARTBEAT_STALE_MS / 1000);
	if (!heartbeat) {
		return {
			state: 'unknown',
			lastSeenAt: null,
			lastJobCompletedAt: null,
			jobsCompleted: 0,
			staleAfterSeconds,
			ageSeconds: null,
			details: null,
		};
	}
	const lastSeen = new Date(heartbeat.lastSeenAt);
	const ageMs = now - lastSeen.getTime();
	return {
		state: ageMs <= WORKER_HEARTBEAT_STALE_MS ? 'alive' : 'stale',
		lastSeenAt: lastSeen.toISOString(),
		lastJobCompletedAt: heartbeat.lastJobCompletedAt
			? new Date(heartbeat.lastJobCompletedAt).toISOString()
			: null,
		jobsCompleted: Number(heartbeat.jobsCompleted ?? 0),
		staleAfterSeconds,
		ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
		details: heartbeat.details ?? null,
	};
}

export function startWorkerHeartbeat(details: WorkerHeartbeatDetails = workerBootDetails()): () => void {
	let first = true;
	const beat = () => {
		const boot = first ? details : undefined;
		first = false;
		recordWorkerHeartbeat(0, boot).catch((err) => {
			first = first || boot !== undefined;
			console.error('[worker] heartbeat write failed:', err);
		});
	};
	beat();
	const timer = setInterval(beat, WORKER_HEARTBEAT_INTERVAL_MS);
	timer.unref?.();
	return () => clearInterval(timer);
}
