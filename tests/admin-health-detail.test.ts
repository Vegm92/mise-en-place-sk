/**
 * /admin/health still shows everything it did before the #491 split of
 * /api/health. The admin page never consumed /api/health directly — it
 * reads `runSystemChecks` / `tableRowCounts` from `$lib/server/system-health`
 * — so this pins that its `load` still passes every field through untouched
 * now that the public endpoint's detail moved behind admin/token auth.
 */
import { describe, it, expect, vi } from 'vitest';

const { runSystemChecksMock, tableRowCountsMock, stuckBatchItemsMock } = vi.hoisted(() => ({
	runSystemChecksMock: vi.fn().mockResolvedValue({
		checks: [{ name: 'Database', status: 'ok', detail: 'Connection healthy' }],
		overall: 'ok',
		gates: { dbRole: 'warn', migrations: 'ok', worker: 'warn' },
		whatsapp: null,
		sentry: { configured: false, unresolved: 0, critical: 0, events24h: 0 },
		queue: { stuck: 0, lastExtraction: null, depth: null },
		extraction: null,
		jobs: null,
		scheduledJobs: { queues: [], runs: [] },
		worker: { state: 'unknown', lastSeenAt: null, lastJobCompletedAt: null, jobsCompleted: 0, staleAfterSeconds: 120, ageSeconds: null, details: null },
		deadLetters: { pending: 0 },
		dbRole: null,
		migrations: null,
		stripeWebhooks: null,
		access: { pending: 0 },
		env: { missing: [], recommended: [] },
		probes: { gemini: null, stripe: null, resend: null, whatsappCloud: null },
		checkedAt: '2026-08-27T00:00:00.000Z',
	}),
	tableRowCountsMock: vi.fn().mockResolvedValue([{ table: 'invoices', rows: 42 }]),
	stuckBatchItemsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('$lib/server/system-health', () => ({
	runSystemChecks: runSystemChecksMock,
	tableRowCounts: tableRowCountsMock,
	stuckBatchItems: stuckBatchItemsMock,
}));

vi.mock('$lib/server/batch', () => ({ requeueStalled: vi.fn() }));
vi.mock('$lib/server/queue', () => ({ enqueueExtraction: vi.fn() }));

import { load } from '../src/routes/(admin)/admin/health/+page.server';

describe('#491 — /admin/health load keeps the full detail set', () => {
	it('passes through status, checks, whatsapp, checkedAt and table counts', async () => {
		const data = await load({} as never);
		expect(data).toMatchObject({
			title: 'admin.systemHealth',
			overallStatus: 'ok',
			gates: { dbRole: 'warn', migrations: 'ok', worker: 'warn' },
			checks: [{ name: 'Database', status: 'ok', detail: 'Connection healthy' }],
			whatsapp: null,
			checkedAt: '2026-08-27T00:00:00.000Z',
			worker: { state: 'unknown' },
			queue: { stuck: 0, lastExtraction: null, depth: null },
			access: { pending: 0 },
			tableCounts: [{ table: 'invoices', rows: 42 }],
			stuckItems: [],
		});
		expect(runSystemChecksMock).toHaveBeenCalledTimes(1);
		expect(tableRowCountsMock).toHaveBeenCalledTimes(1);
		expect(stuckBatchItemsMock).toHaveBeenCalledTimes(1);
	});
});
