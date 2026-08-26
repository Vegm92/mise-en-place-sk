/**
 * Stall detection for queued extractions (issue #540).
 *
 * When the worker is down, a queued item used to sit in "Extrayendo…" forever:
 * the spinner is the only signal and it is indistinguishable from slow-but-
 * working. These tests pin the two thresholds that replace that eternal
 * spinner — a warning state with a Retry action, then a hard timeout — and the
 * polling endpoint that surfaces the flip without a status change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	stallLevel, pickStalledItem, STALL_ERROR,
	type BatchItem, type BatchItemStatus,
} from '../src/lib/server/batch';
import { EXTRACTION_STALL_WARN_MS, EXTRACTION_STALL_TIMEOUT_MS } from '../src/lib/server/env';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

function item(id: string, status: BatchItemStatus, queuedMsAgo: number | null, base = NOW): BatchItem {
	return {
		id,
		position: 1,
		status,
		batchId: 'b',
		restaurantId: 'r',
		fileKey: `b/${id}.pdf`,
		displayName: `${id}.pdf`,
		extractedData: null,
		conversionNotes: null,
		extractError: null,
		queuedAt: queuedMsAgo === null ? null : new Date(base - queuedMsAgo),
	};
}

describe('stallLevel', () => {
	it('is none for an item that just entered the queue', () => {
		expect(stallLevel(item('a', 'queued', 1_000), NOW)).toBe('none');
	});

	it('turns slow exactly at the warning threshold', () => {
		expect(stallLevel(item('a', 'queued', EXTRACTION_STALL_WARN_MS - 1), NOW)).toBe('none');
		expect(stallLevel(item('a', 'queued', EXTRACTION_STALL_WARN_MS), NOW)).toBe('slow');
	});

	it('turns expired exactly at the hard timeout', () => {
		expect(stallLevel(item('a', 'extracting', EXTRACTION_STALL_TIMEOUT_MS - 1), NOW)).toBe('slow');
		expect(stallLevel(item('a', 'extracting', EXTRACTION_STALL_TIMEOUT_MS), NOW)).toBe('expired');
	});

	it('only judges in-flight items — a settled one is never stalled', () => {
		for (const status of ['pending', 'done', 'failed', 'confirmed', 'discarded'] as BatchItemStatus[]) {
			expect(stallLevel(item('a', status, EXTRACTION_STALL_TIMEOUT_MS * 10), NOW)).toBe('none');
		}
	});

	it('never fires on a row that predates the queued_at column', () => {
		expect(stallLevel(item('a', 'queued', null), NOW)).toBe('none');
	});
});

describe('pickStalledItem', () => {
	it('returns null while everything in flight is inside the warning window', () => {
		expect(pickStalledItem([
			item('a', 'queued', 1_000),
			item('b', 'extracting', EXTRACTION_STALL_WARN_MS - 1),
		], NOW)).toBeNull();
	});

	it('reports the item that has been waiting longest', () => {
		const picked = pickStalledItem([
			item('a', 'queued', EXTRACTION_STALL_WARN_MS + 1_000),
			item('b', 'extracting', EXTRACTION_STALL_WARN_MS + 60_000),
			item('c', 'queued', 1_000),
		], NOW);
		expect(picked?.id).toBe('b');
	});
});

const { getBatchItemsMock, failStalledItemsMock } = vi.hoisted(() => ({
	getBatchItemsMock: vi.fn(),
	failStalledItemsMock: vi.fn(),
}));

vi.mock('$lib/server/batch', async () => {
	const actual = await vi.importActual<typeof import('../src/lib/server/batch')>(
		'../src/lib/server/batch',
	);
	return {
		...actual,
		getBatchItems: getBatchItemsMock,
		failStalledItems: failStalledItemsMock,
	};
});

function liveItem(id: string, status: BatchItemStatus, queuedMsAgo: number | null): BatchItem {
	return item(id, status, queuedMsAgo, Date.now());
}

const LOCALS = { user: { id: 'u' }, restaurantId: 'r' };

async function getStatus() {
	const { GET } = await import('../src/routes/api/batch-status/[id]/+server');
	const res = await (GET as never as (e: unknown) => Promise<Response>)({
		params: { id: 'batch-1' },
		locals: LOCALS,
	});
	return { status: res.status, body: await res.json() };
}

describe('/api/batch-status/[id] — stall reporting', () => {
	beforeEach(() => {
		getBatchItemsMock.mockReset();
		failStalledItemsMock.mockReset().mockResolvedValue(0);
	});

	it('reports stalled once the warning threshold passes, with no status change', async () => {
		getBatchItemsMock.mockResolvedValue([liveItem('a', 'queued', EXTRACTION_STALL_WARN_MS + 5_000)]);

		const { body } = await getStatus();

		expect(body.stalled).toBe(true);
		expect(body.items[0]).toMatchObject({ status: 'queued', stalled: true });
		expect(failStalledItemsMock).not.toHaveBeenCalled();
	});

	it('reaps an expired item and reports it as failed with a retryable error', async () => {
		getBatchItemsMock
			.mockResolvedValueOnce([liveItem('a', 'queued', EXTRACTION_STALL_TIMEOUT_MS + 1_000)])
			.mockResolvedValueOnce([{ ...liveItem('a', 'failed', null), extractError: STALL_ERROR }]);
		failStalledItemsMock.mockResolvedValue(1);

		const { body } = await getStatus();

		expect(failStalledItemsMock).toHaveBeenCalledWith('batch-1');
		expect(body.stalled).toBe(false);
		expect(body.items[0]).toMatchObject({ status: 'failed', error: STALL_ERROR, stalled: false });
	});

	it('leaves a healthy batch alone', async () => {
		getBatchItemsMock.mockResolvedValue([liveItem('a', 'extracting', 3_000)]);

		const { body } = await getStatus();

		expect(body.stalled).toBe(false);
		expect(failStalledItemsMock).not.toHaveBeenCalled();
	});

	it('still refuses another tenant\'s batch', async () => {
		getBatchItemsMock.mockResolvedValue([{ ...liveItem('a', 'queued', 0), restaurantId: 'other' }]);
		expect((await getStatus()).status).toBe(404);
	});
});
