/**
 * The latency and depth series (#1003).
 *
 * Two properties matter more than the arithmetic. First, aggregation: the whole
 * reason this buffers in memory is that a row per request would be ~200k rows a
 * month, so a window of N readings on one label must leave exactly one row.
 * Second, that recording never becomes a failure mode of its own — a metric
 * write that throws must not take down the request or job it is measuring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
	insert: vi.fn(() => ({ values: dbMocks.values })),
	values: vi.fn(async () => undefined),
}));
vi.mock('../src/lib/server/db', () => ({ db: { insert: dbMocks.insert } }));

const {
	METRIC_QUEUE_DEPTH, METRIC_ROUTE_LATENCY,
	drain, flushMetrics, observe, recordGauge,
} = await import('../src/lib/server/metrics');

beforeEach(() => {
	drain();
	vi.clearAllMocks();
	dbMocks.insert.mockImplementation(() => ({ values: dbMocks.values }));
	dbMocks.values.mockResolvedValue(undefined);
});

describe('observe — bucketing', () => {
	it('collapses a window of readings on one label into a single sample', () => {
		observe(METRIC_ROUTE_LATENCY, 10, '/dashboard');
		observe(METRIC_ROUTE_LATENCY, 30, '/dashboard');
		observe(METRIC_ROUTE_LATENCY, 20, '/dashboard');

		expect(drain()).toEqual([
			{ name: METRIC_ROUTE_LATENCY, label: '/dashboard', count: 3, sum: 60, min: 10, max: 30 },
		]);
	});

	it('keeps labels apart', () => {
		observe(METRIC_ROUTE_LATENCY, 5, '/a');
		observe(METRIC_ROUTE_LATENCY, 7, '/b');

		expect(drain()).toHaveLength(2);
	});

	it('keeps a label with a delimiter-ish route id intact', () => {
		// Route ids are arbitrary text — '/(app)/batch/[id]' must come back whole.
		observe(METRIC_ROUTE_LATENCY, 1, '/(app)/batch/[id]');

		expect(drain()[0].label).toBe('/(app)/batch/[id]');
	});

	it('ignores a non-finite reading rather than poisoning the bucket', () => {
		observe(METRIC_ROUTE_LATENCY, Number.NaN, '/a');
		observe(METRIC_ROUTE_LATENCY, Number.POSITIVE_INFINITY, '/a');

		expect(drain()).toEqual([]);
	});

	it('empties the buffer, so the next window starts clean', () => {
		observe(METRIC_ROUTE_LATENCY, 1, '/a');
		drain();

		expect(drain()).toEqual([]);
	});
});

describe('flushMetrics', () => {
	it('writes one row per bucket and clears the buffer', async () => {
		observe(METRIC_ROUTE_LATENCY, 10, '/a');
		observe(METRIC_ROUTE_LATENCY, 20, '/a');
		observe(METRIC_ROUTE_LATENCY, 5, '/b');

		expect(await flushMetrics()).toBe(2);
		expect(dbMocks.values).toHaveBeenCalledWith([
			{ name: METRIC_ROUTE_LATENCY, label: '/a', count: 2, sum: 30, min: 10, max: 20 },
			{ name: METRIC_ROUTE_LATENCY, label: '/b', count: 1, sum: 5, min: 5, max: 5 },
		]);
		expect(await flushMetrics()).toBe(0);
	});

	it('does not touch the database when nothing was observed', async () => {
		expect(await flushMetrics()).toBe(0);
		expect(dbMocks.insert).not.toHaveBeenCalled();
	});

	it('drops the window rather than throwing when the write fails', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
		dbMocks.values.mockRejectedValue(new Error('db down'));
		observe(METRIC_ROUTE_LATENCY, 10, '/a');

		await expect(flushMetrics()).resolves.toBe(0);

		// Buffering a failed window would grow without bound for as long as the
		// database stays unhappy — exactly when the process can least afford it.
		expect(drain()).toEqual([]);
		errorSpy.mockRestore();
	});
});

describe('recordGauge', () => {
	it('writes a reading straight through as a one-count sample', async () => {
		await recordGauge(METRIC_QUEUE_DEPTH, 12, 'extract-invoice');

		expect(dbMocks.values).toHaveBeenCalledWith({
			name: METRIC_QUEUE_DEPTH, label: 'extract-invoice', count: 1, sum: 12, min: 12, max: 12,
		});
	});

	it('swallows a write failure', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
		dbMocks.values.mockRejectedValue(new Error('db down'));

		await expect(recordGauge(METRIC_QUEUE_DEPTH, 1, 'q')).resolves.toBeUndefined();
		errorSpy.mockRestore();
	});
});
