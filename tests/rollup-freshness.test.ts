/**
 * Rollup freshness on /admin/health (issue #1004).
 *
 * A failed nightly `refresh_analytics_rollups()` was never silent — the
 * scheduler wrapper captures it to Sentry and dead-letters it. What was
 * missing is the *read* side: `/analytics/spend` kept rendering last-good
 * numbers with nothing anywhere saying how old they were, and migration
 * `0034_price_snapshots_plain_column_index.sql:6` records that this exact
 * function had been failing on one of its statements since #299 without
 * anyone noticing.
 *
 * `runAnalyticsRefreshJob` now stamps `app_flags` on success and the health
 * page reads it back against the threshold documented in
 * `docs/05_operations/monitoring.md`. These pin both halves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getFlagMock, setFlagMock, dbExecuteMock } = vi.hoisted(() => ({
	getFlagMock: vi.fn<(key: string) => Promise<string | null>>(),
	setFlagMock: vi.fn<(key: string, value: string) => Promise<void>>().mockResolvedValue(undefined),
	dbExecuteMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('$lib/server/app-flags', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/app-flags')>();
	return { ...actual, getFlag: getFlagMock, setFlag: setFlagMock };
});

vi.mock('$lib/server/db', () => ({
	db: { execute: dbExecuteMock },
	forTenant: vi.fn(),
	runAsSystem: (fn: () => unknown) => fn(),
}));

import { ANALYTICS_ROLLUP_REFRESHED_FLAG } from '../src/lib/server/app-flags';
import { rollupFreshness, rollupFreshnessCheck } from '../src/lib/server/system-health';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-08T12:00:00.000Z');

beforeEach(() => {
	getFlagMock.mockReset();
	setFlagMock.mockClear();
	dbExecuteMock.mockClear();
});

describe('rollupFreshness', () => {
	it('reports the age of the last successful refresh', async () => {
		getFlagMock.mockResolvedValue(new Date(NOW - 5 * HOUR).toISOString());
		const freshness = await rollupFreshness(NOW);
		expect(getFlagMock).toHaveBeenCalledWith(ANALYTICS_ROLLUP_REFRESHED_FLAG);
		expect(freshness.ageHours).toBeCloseTo(5);
		expect(freshness.warnAfterHours).toBe(26);
		expect(freshness.errorAfterHours).toBe(48);
	});

	it('reports no age when nothing has ever succeeded', async () => {
		getFlagMock.mockResolvedValue(null);
		expect(await rollupFreshness(NOW)).toMatchObject({ refreshedAt: null, ageHours: null });
	});

	it('treats an unparseable stamp as no stamp rather than as NaN hours', async () => {
		getFlagMock.mockResolvedValue('not a timestamp');
		expect(await rollupFreshness(NOW)).toMatchObject({ refreshedAt: null, ageHours: null });
	});
});

describe('rollupFreshnessCheck', () => {
	const at = (ageHours: number | null) => ({
		refreshedAt: ageHours === null ? null : new Date(NOW - ageHours * HOUR).toISOString(),
		ageHours,
		warnAfterHours: 26,
		errorAfterHours: 48,
	});

	it('is ok inside the daily cadence', () => {
		expect(rollupFreshnessCheck(at(25)).status).toBe('ok');
	});

	it('warns once a nightly run has been missed', () => {
		const check = rollupFreshnessCheck(at(26));
		expect(check.status).toBe('warn');
		expect(check.detail).toContain('warn past 26 h');
	});

	it('errors once two have', () => {
		expect(rollupFreshnessCheck(at(48)).status).toBe('error');
	});

	it('warns, not errors, when no refresh is on record — a fresh database looks the same', () => {
		const check = rollupFreshnessCheck(at(null));
		expect(check.status).toBe('warn');
		expect(check.detail).toContain('No successful analytics refresh on record');
	});
});

describe('runAnalyticsRefreshJob', () => {
	it('stamps the flag only after the refresh returns', async () => {
		const { runAnalyticsRefreshJob } = await import('../src/lib/server/maintenance-jobs');
		const order: string[] = [];
		dbExecuteMock.mockImplementation(async () => {
			order.push('refresh');
			return [];
		});
		setFlagMock.mockImplementation(async () => {
			order.push('stamp');
		});

		const result = await runAnalyticsRefreshJob();

		expect(order).toEqual(['refresh', 'stamp']);
		expect(setFlagMock).toHaveBeenCalledWith(ANALYTICS_ROLLUP_REFRESHED_FLAG, result.refreshedAt);
		expect(result.refreshed).toBe(true);
	});

	it('leaves the flag untouched when the refresh throws, so a failed run reads as stale', async () => {
		const { runAnalyticsRefreshJob } = await import('../src/lib/server/maintenance-jobs');
		dbExecuteMock.mockRejectedValue(new Error('mv_price_snapshots does not exist'));
		await expect(runAnalyticsRefreshJob()).rejects.toThrow('mv_price_snapshots');
		expect(setFlagMock).not.toHaveBeenCalled();
	});
});
