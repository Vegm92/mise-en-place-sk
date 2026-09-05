import * as Sentry from '@sentry/sveltekit';
import { readWorkerHeartbeat, workerLiveness, type WorkerLiveness, type WorkerLivenessState } from './worker-heartbeat';

const WORKER_LIVENESS_CHECK_MS = parseInt(process.env.WORKER_LIVENESS_CHECK_MS ?? '60000', 10);
const STALE_FINGERPRINT = ['worker-heartbeat-stale'];

export type LivenessTransition = 'went-stale' | 'recovered' | null;

export function livenessTransition(previous: WorkerLivenessState | null, next: WorkerLivenessState): LivenessTransition {
	if (next === 'stale' && previous === 'alive') return 'went-stale';
	if (next === 'alive' && previous === 'stale') return 'recovered';
	return null;
}

export function reportLivenessTransition(transition: LivenessTransition, liveness: WorkerLiveness): void {
	if (transition === 'went-stale') {
		console.error(`[worker-liveness] no heartbeat for ${liveness.ageSeconds ?? '?'}s (stale after ${liveness.staleAfterSeconds}s) — worker down or wedged`);
		Sentry.captureMessage('Worker heartbeat stale', {
			level: 'error',
			fingerprint: STALE_FINGERPRINT,
			tags: { subsystem: 'worker-liveness' },
			extra: { lastSeenAt: liveness.lastSeenAt, ageSeconds: liveness.ageSeconds, jobsCompleted: liveness.jobsCompleted },
		});
	} else if (transition === 'recovered') {
		console.info('[worker-liveness] heartbeat recovered');
		Sentry.captureMessage('Worker heartbeat recovered', {
			level: 'info',
			fingerprint: ['worker-heartbeat-recovered'],
			tags: { subsystem: 'worker-liveness' },
		});
	}
}

export function createWorkerLivenessMonitor(read: () => Promise<WorkerLiveness> = async () => workerLiveness(await readWorkerHeartbeat())) {
	let previous: WorkerLivenessState | null = null;
	return async function check(): Promise<LivenessTransition> {
		const liveness = await read();
		const transition = livenessTransition(previous, liveness.state);
		previous = liveness.state;
		reportLivenessTransition(transition, liveness);
		return transition;
	};
}

export function startWorkerLivenessMonitor(): () => void {
	if (process.env.VITEST || process.env.NODE_ENV === 'test') return () => {};
	const check = createWorkerLivenessMonitor();
	const tick = () => {
		check().catch((err) => console.error('[worker-liveness] check failed:', err));
	};
	const timer = setInterval(tick, WORKER_LIVENESS_CHECK_MS);
	timer.unref?.();
	tick();
	return () => clearInterval(timer);
}
