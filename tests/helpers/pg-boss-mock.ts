/**
 * Shared pg-boss mock kit for the suites that fully mock the pg-boss client
 * to pin what `queue.ts` hands to `PgBoss#send` (tests/queue-request-id.test.ts,
 * tests/queue-whatsapp-inbound.test.ts): both need the same hoisted mock
 * functions, the same `vi.mock('pg-boss', ...)` factory, and the same
 * DATABASE_URL/clearAllMocks setup around each test. Centralized so that
 * boilerplate doesn't reappear per file (jscpd / `pnpm lint:duplication`).
 *
 * Consume with:
 *   vi.mock('pg-boss', async () => (await import('./helpers/pg-boss-mock')).pgBossMockModule);
 *   import { sendMock, setUpPgBossTestEnv } from './helpers/pg-boss-mock';
 *   setUpPgBossTestEnv();
 */
import { vi, beforeEach, afterAll } from 'vitest';

export const sendMock = vi.fn().mockResolvedValue('job-1');
export const createQueueMock = vi.fn().mockResolvedValue(undefined);
export const updateQueueMock = vi.fn().mockResolvedValue(undefined);
export const startMock = vi.fn().mockResolvedValue(undefined);

/** The module `vi.mock('pg-boss', ...)` should resolve to. */
export const pgBossMockModule = {
	PgBoss: vi.fn().mockImplementation(() => ({
		start: startMock,
		createQueue: createQueueMock,
		updateQueue: updateQueueMock,
		send: sendMock,
	})),
};

/**
 * Registers the beforeEach/afterAll pair every pg-boss-mocking suite needs:
 * clears the mocks between tests and points DATABASE_URL at a fake so
 * queue.ts's lazy PgBoss singleton has something to construct against.
 */
export function setUpPgBossTestEnv(): void {
	const originalDatabaseUrl = process.env.DATABASE_URL;
	beforeEach(() => {
		vi.clearAllMocks();
		sendMock.mockResolvedValue('job-1');
		process.env.DATABASE_URL = 'postgres://localhost:5432/mep_test';
	});
	afterAll(() => {
		process.env.DATABASE_URL = originalDatabaseUrl;
	});
}
