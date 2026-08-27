/**
 * /admin/health still shows everything it did before the #491 split of
 * /api/health. The admin page never consumed /api/health directly — it
 * reads `runSystemChecks` / `tableRowCounts` from `$lib/server/system-health`
 * — so this pins that its `load` still passes every field through untouched
 * now that the public endpoint's detail moved behind admin/token auth.
 */
import { describe, it, expect, vi } from 'vitest';

const { runSystemChecksMock, tableRowCountsMock } = vi.hoisted(() => ({
	runSystemChecksMock: vi.fn().mockResolvedValue({
		checks: [{ name: 'Database', status: 'ok', detail: 'Connection healthy' }],
		overall: 'ok',
		whatsapp: null,
		sentry: { configured: false, unresolved: 0, critical: 0 },
		queue: { stuck: 0, lastExtraction: null },
		scheduledJobs: { queues: [], runs: [] },
		worker: { state: 'unknown', lastSeenAt: null, lastJobCompletedAt: null, jobsCompleted: 0, staleAfterSeconds: 120 },
		deadLetters: { pending: 0 },
		checkedAt: '2026-08-27T00:00:00.000Z',
	}),
	tableRowCountsMock: vi.fn().mockResolvedValue([{ table: 'invoices', rows: 42 }]),
}));

vi.mock('$lib/server/system-health', () => ({
	runSystemChecks: runSystemChecksMock,
	tableRowCounts: tableRowCountsMock,
}));

import { load } from '../src/routes/(admin)/admin/health/+page.server';

describe('#491 — /admin/health load keeps the full detail set', () => {
	it('passes through status, checks, whatsapp, checkedAt and table counts', async () => {
		const data = await load({} as never);
		expect(data).toEqual({
			title: 'Admin · Health',
			overallStatus: 'ok',
			checks: [{ name: 'Database', status: 'ok', detail: 'Connection healthy' }],
			whatsapp: null,
			checkedAt: '2026-08-27T00:00:00.000Z',
			tableCounts: [{ table: 'invoices', rows: 42 }],
		});
		expect(runSystemChecksMock).toHaveBeenCalledTimes(1);
		expect(tableRowCountsMock).toHaveBeenCalledTimes(1);
	});
});
