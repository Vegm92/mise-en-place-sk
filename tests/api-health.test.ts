/**
 * /api/health split (issue #491) — the public endpoint used to disclose DB
 * size, queue depth, uptime and version to anyone, and ran pg_database_size +
 * a pgboss COUNT on every unauthenticated hit with no rate limit.
 *
 * These pin the new contract: the public response is `{ status }` and
 * nothing else, a DB outage flips it to 503 `degraded`, the full detail
 * (db/worker/uploads_dir/sessions/uptime_seconds/version) requires an admin
 * session or a valid `X-Health-Token`, and the endpoint is rate-limited.
 *
 * db, the rate limiter, admin check and worker heartbeat are mocked — this
 * suite never touches Postgres.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbExecuteMock, dbSelectMock, rateLimitMock, isAdminUserMock } = vi.hoisted(() => ({
	dbExecuteMock: vi.fn().mockResolvedValue([{ size: 1048576, pending: 2 }]),
	dbSelectMock: vi.fn(() => ({
		from: () => ({
			where: () => Promise.resolve([{ cnt: 3 }]),
		}),
	})),
	rateLimitMock: vi.fn().mockResolvedValue(true),
	isAdminUserMock: vi.fn().mockReturnValue(false),
}));

vi.mock('$lib/server/db', () => ({
	db: { execute: dbExecuteMock, select: dbSelectMock },
}));
vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/admin', () => ({ isAdminUser: isAdminUserMock }));
vi.mock('$lib/server/worker-heartbeat', () => ({
	readWorkerHeartbeat: vi.fn().mockResolvedValue(null),
	workerLiveness: vi.fn().mockReturnValue({
		state: 'unknown',
		lastSeenAt: null,
		lastJobCompletedAt: null,
		jobsCompleted: 0,
		staleAfterSeconds: 120,
	}),
}));
vi.mock('$lib/server/env', () => ({
	STORAGE_DRIVER: 'railway',
	UPLOADS_DIR: 'uploads',
	HEALTH_CHECK_TOKEN: 'test-health-token',
	HEALTH_RATE_LIMIT_RPM: 60,
}));

import { GET } from '../src/routes/api/health/+server';

type HealthEventOpts = {
	token?: string;
	user?: { id: string; email: string; name: string | null; image: string | null } | null;
};

function healthEvent(opts: HealthEventOpts = {}) {
	const headers = new Headers();
	if (opts.token) headers.set('x-health-token', opts.token);
	return {
		request: new Request('http://localhost/api/health', { headers }),
		locals: { user: opts.user ?? null },
		getClientAddress: () => '198.51.100.5',
	} as unknown as Parameters<typeof GET>[0];
}

const DETAIL_KEYS = ['db', 'sessions', 'status', 'uploads_dir', 'uptime_seconds', 'version', 'worker'].sort();

beforeEach(() => {
	dbExecuteMock.mockReset().mockResolvedValue([{ size: 1048576, pending: 2 }]);
	dbSelectMock.mockReset().mockReturnValue({ from: () => ({ where: () => Promise.resolve([{ cnt: 3 }]) }) });
	rateLimitMock.mockReset().mockResolvedValue(true);
	isAdminUserMock.mockReset().mockReturnValue(false);
});

describe('#491 — public GET /api/health leaks nothing', () => {
	it('healthy DB: response is exactly { status: "ok" }, HTTP 200', async () => {
		const res = await GET(healthEvent());
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Object.keys(body)).toEqual(['status']);
		expect(body.status).toBe('ok');
	});

	it('unreachable DB: response is exactly { status: "degraded" }, HTTP 503', async () => {
		dbExecuteMock.mockRejectedValueOnce(new Error('connection refused'));
		const res = await GET(healthEvent());
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body).toEqual({ status: 'degraded' });
	});

	it('never runs the DB-size / queue-depth queries on the cheap path', async () => {
		await GET(healthEvent());
		expect(dbExecuteMock).toHaveBeenCalledTimes(1);
		expect(dbSelectMock).not.toHaveBeenCalled();
	});
});

describe('#491 — detailed health requires admin auth or a token', () => {
	it('anonymous caller gets no detail, even with a wrong token', async () => {
		const res = await GET(healthEvent({ token: 'not-the-secret' }));
		const body = await res.json();
		expect(Object.keys(body)).toEqual(['status']);
	});

	it('non-admin authenticated caller gets no detail', async () => {
		isAdminUserMock.mockReturnValue(false);
		const res = await GET(healthEvent({ user: { id: 'u1', email: 'chef@example.com', name: null, image: null } }));
		const body = await res.json();
		expect(Object.keys(body)).toEqual(['status']);
	});

	it('admin session gets the full detail set', async () => {
		isAdminUserMock.mockReturnValue(true);
		const res = await GET(healthEvent({ user: { id: 'admin', email: 'admin@example.com', name: null, image: null } }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Object.keys(body).sort()).toEqual(DETAIL_KEYS);
		expect(body.db).toEqual({ reachable: true, size_mb: 1 });
		expect(body.sessions).toEqual({ active_count: 3 });
		expect(body.worker.pending).toBe(2);
		expect(body.uploads_dir).toBeNull();
		expect(typeof body.uptime_seconds).toBe('number');
		expect('version' in body).toBe(true);
	});

	it('a valid X-Health-Token grants detail without an admin session', async () => {
		isAdminUserMock.mockReturnValue(false);
		const res = await GET(healthEvent({ token: 'test-health-token' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Object.keys(body).sort()).toEqual(DETAIL_KEYS);
	});
});

describe('#491 — public endpoint is rate-limited', () => {
	it('keys the limit by client IP and rejects with 429 once exhausted', async () => {
		rateLimitMock.mockResolvedValueOnce(false);
		const res = await GET(healthEvent());
		expect(res.status).toBe(429);
		expect(res.headers.get('Retry-After')).toBe('60');
		expect(rateLimitMock).toHaveBeenCalledWith('health:198.51.100.5', 60);
	});

	it('a rate-limited request is rejected before any DB check runs', async () => {
		rateLimitMock.mockResolvedValueOnce(false);
		await GET(healthEvent());
		expect(dbExecuteMock).not.toHaveBeenCalled();
	});
});
