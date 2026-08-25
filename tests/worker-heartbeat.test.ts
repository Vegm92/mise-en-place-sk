/**
 * Worker liveness (issue #540) — the signal that tells an operator whether a
 * queue that is not draining means "worker down" or "worker busy". Without it
 * the only person who can tell the difference is someone reading server logs.
 */
import { describe, it, expect } from 'vitest';
import { workerLiveness, type WorkerHeartbeat } from '../src/lib/server/worker-heartbeat';
import { WORKER_HEARTBEAT_STALE_MS } from '../src/lib/server/env';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

function heartbeat(seenMsAgo: number, jobMsAgo: number | null = null): WorkerHeartbeat {
	return {
		id: 'worker',
		startedAt: new Date(NOW - 3_600_000),
		lastSeenAt: new Date(NOW - seenMsAgo),
		lastJobCompletedAt: jobMsAgo === null ? null : new Date(NOW - jobMsAgo),
		jobsCompleted: jobMsAgo === null ? 0 : 7,
	};
}

describe('workerLiveness', () => {
	it('is unknown when the worker has never run against this database', () => {
		const liveness = workerLiveness(null, NOW);
		expect(liveness.state).toBe('unknown');
		expect(liveness.lastSeenAt).toBeNull();
		expect(liveness.lastJobCompletedAt).toBeNull();
	});

	it('is alive while the heartbeat is inside the staleness window', () => {
		expect(workerLiveness(heartbeat(0), NOW).state).toBe('alive');
		expect(workerLiveness(heartbeat(WORKER_HEARTBEAT_STALE_MS), NOW).state).toBe('alive');
	});

	it('turns stale one millisecond past the window', () => {
		expect(workerLiveness(heartbeat(WORKER_HEARTBEAT_STALE_MS + 1), NOW).state).toBe('stale');
	});

	it('reports an idle-but-alive worker as alive, not stale', () => {
		const liveness = workerLiveness(heartbeat(5_000, 6 * 3_600_000), NOW);
		expect(liveness.state).toBe('alive');
		expect(liveness.lastJobCompletedAt).toBe(new Date(NOW - 6 * 3_600_000).toISOString());
	});

	it('surfaces both timestamps as ISO strings for the health payload', () => {
		const liveness = workerLiveness(heartbeat(1_000, 2_000), NOW);
		expect(liveness.lastSeenAt).toBe(new Date(NOW - 1_000).toISOString());
		expect(liveness.jobsCompleted).toBe(7);
		expect(liveness.staleAfterSeconds).toBe(Math.round(WORKER_HEARTBEAT_STALE_MS / 1000));
	});
});
