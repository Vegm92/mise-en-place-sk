/**
 * Issue #1000 — every queue retried with a flat `retryDelay`, so a Gemini 429
 * on `extract-invoice` re-hit the same rate limit at a constant 30 s. pg-boss
 * supports `retryBackoff` on the same options object; the in-process retry in
 * extract.ts (1 s / 2 s / 4 s) already backs off, only the queue layer was
 * flat.
 *
 * pg-boss's backed-off delay is
 * `min(retryDelayMax, retryDelay * (2 ^ n / 2 + 2 ^ n / 2 * random()))`, i.e.
 * jittered between one and two times `retryDelay * 2 ^ (retryCount)`, so a cap
 * is what keeps the worst case bounded — `extract-invoice`'s has to stay under
 * `EXTRACTION_STALL_TIMEOUT_MS` (15 min), which is measured in wall-clock from
 * the item's last update, or the reaper marks a legitimately retrying item
 * `extract.err.stalled`.
 *
 * `expireInSeconds` is deliberately unchanged: pg-boss expires a job at
 * `started_on + expire_seconds` (dist/plans.js), i.e. per attempt, so the
 * retry delays do not consume it.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('pg-boss', async () => (await import('./helpers/pg-boss-mock')).pgBossMockModule);

import {
	enqueueExtraction,
	enqueueNormalize,
	enqueueCategorize,
	enqueueWhatsAppNotify,
	enqueueWhatsAppInbound,
	enqueueAccountCleanup,
} from '../src/lib/server/queue';
import { EXTRACTION_STALL_TIMEOUT_MS } from '../src/lib/server/env';
import { sendMock, setUpPgBossTestEnv } from './helpers/pg-boss-mock';

setUpPgBossTestEnv();

function optionsOf(): Record<string, unknown> {
	return sendMock.mock.calls[0]![2] as Record<string, unknown>;
}

describe('every queue backs off between retries', () => {
	it('extract-invoice', async () => {
		await enqueueExtraction('item-1', 'rest-1');
		expect(optionsOf()).toEqual(expect.objectContaining({
			retryLimit: 2, retryDelay: 30, retryBackoff: true, retryDelayMax: 300,
		}));
	});

	it('normalize-product', async () => {
		await enqueueNormalize('rest-1', 42, 'Naranja');
		expect(optionsOf()).toEqual(expect.objectContaining({ retryBackoff: true, retryDelayMax: 300 }));
	});

	it('categorize-product', async () => {
		await enqueueCategorize('rest-1', 42, 'Naranja');
		expect(optionsOf()).toEqual(expect.objectContaining({ retryBackoff: true, retryDelayMax: 300 }));
	});

	it('whatsapp-notify', async () => {
		await enqueueWhatsAppNotify('item-1', 'rest-1');
		expect(optionsOf()).toEqual(expect.objectContaining({ retryBackoff: true, retryDelayMax: 600 }));
	});

	it('whatsapp-inbound', async () => {
		await enqueueWhatsAppInbound({ from: '+34600000001', id: 'wamid.abc', type: 'text' });
		expect(optionsOf()).toEqual(expect.objectContaining({ retryBackoff: true, retryDelayMax: 600 }));
	});

	it('account-cleanup', async () => {
		await enqueueAccountCleanup('user-1', 'rest-1', ['sub-1'], ['key-1']);
		expect(optionsOf()).toEqual(expect.objectContaining({ retryBackoff: true, retryDelayMax: 900 }));
	});
});

describe('the extraction backoff stays inside the stall reaper window', () => {
	it('the capped gap between two attempts is well under EXTRACTION_STALL_TIMEOUT_MS', async () => {
		await enqueueExtraction('item-1', 'rest-1');
		const { retryDelayMax } = optionsOf() as { retryDelayMax: number };
		expect(retryDelayMax * 1000).toBeLessThan(EXTRACTION_STALL_TIMEOUT_MS);
	});
});
