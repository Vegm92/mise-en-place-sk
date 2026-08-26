import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { workerHeartbeats } from './schema';
import { WORKER_HEARTBEAT_INTERVAL_MS, WORKER_HEARTBEAT_STALE_MS } from './env';

export const WORKER_ID = 'worker';

export interface WorkerHeartbeat {
	id: string;
	startedAt: Date;
	lastSeenAt: Date;
	lastJobCompletedAt: Date | null;
	jobsCompleted: number;
}

export type WorkerLivenessState = 'alive' | 'stale' | 'unknown';

export interface WorkerLiveness {
	state: WorkerLivenessState;
	lastSeenAt: string | null;
	lastJobCompletedAt: string | null;
	jobsCompleted: number;
	staleAfterSeconds: number;
}

export async function recordWorkerHeartbeat(jobsCompleted = 0): Promise<void> {
	const now = new Date();
	await db
		.insert(workerHeartbeats)
		.values({
			id: WORKER_ID,
			startedAt: now,
			lastSeenAt: now,
			lastJobCompletedAt: jobsCompleted > 0 ? now : null,
			jobsCompleted,
		})
		.onConflictDoUpdate({
			target: workerHeartbeats.id,
			set: {
				lastSeenAt: now,
				lastJobCompletedAt: jobsCompleted > 0
					? now
					: sql`${workerHeartbeats.lastJobCompletedAt}`,
				jobsCompleted: sql`${workerHeartbeats.jobsCompleted} + ${jobsCompleted}`,
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
		};
	}
	const lastSeen = new Date(heartbeat.lastSeenAt);
	return {
		state: now - lastSeen.getTime() <= WORKER_HEARTBEAT_STALE_MS ? 'alive' : 'stale',
		lastSeenAt: lastSeen.toISOString(),
		lastJobCompletedAt: heartbeat.lastJobCompletedAt
			? new Date(heartbeat.lastJobCompletedAt).toISOString()
			: null,
		jobsCompleted: Number(heartbeat.jobsCompleted ?? 0),
		staleAfterSeconds,
	};
}

export function startWorkerHeartbeat(): () => void {
	const beat = () => {
		recordWorkerHeartbeat().catch((err) => {
			console.error('[worker] heartbeat write failed:', err);
		});
	};
	beat();
	const timer = setInterval(beat, WORKER_HEARTBEAT_INTERVAL_MS);
	timer.unref?.();
	return () => clearInterval(timer);
}
