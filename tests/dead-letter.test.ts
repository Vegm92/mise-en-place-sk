/**
 * Dead letters — the payload redaction the admin page shows, error
 * description for job outputs, and the worker wrapper that runs a job inside
 * its tenant's context and rethrows so pg-boss marks it failed.
 *
 * The pg-boss-backed read/retry/discard path lives in dead-letter-db.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

const { tenantRuns } = vi.hoisted(() => ({ tenantRuns: [] as string[] }));

vi.mock('$lib/server/db', () => ({
	db: {},
	runWithTenantContext: (rid: string, fn: () => unknown) => {
		tenantRuns.push(rid);
		return fn();
	},
}));

import {
	describeError,
	redactPayload,
	redactString,
	runJob,
	serializePayload,
} from '../src/lib/server/dead-letter';

describe('redactPayload', () => {
	it('masks values under sensitive keys instead of storing them', () => {
		const out = redactPayload({
			restaurantId: 'r1',
			apiKey: 'AIza-super-secret',
			password: 'hunter2',
			authorization: 'Bearer abc',
		}) as Record<string, unknown>;

		expect(out.restaurantId).toBe('r1');
		expect(out.apiKey).toBe('[redacted]');
		expect(out.password).toBe('[redacted]');
		expect(out.authorization).toBe('[redacted]');
	});

	it('masks email addresses wherever they appear in free text', () => {
		expect(redactString('contact chef@example.com now')).toBe('contact [redacted] now');
	});

	it('caps long strings and keeps a length marker', () => {
		const out = redactPayload({ raw: 'x'.repeat(900) }) as Record<string, string>;
		expect(out.raw!.startsWith('x'.repeat(512))).toBe(true);
		expect(out.raw).toContain('[+388 chars]');
	});

	it('caps long arrays with a remainder marker', () => {
		const out = redactPayload(Array.from({ length: 40 }, (_, i) => i)) as unknown[];
		expect(out).toHaveLength(26);
		expect(out[25]).toBe('[+15 more]');
	});

	it('stops recursing past the depth limit', () => {
		const deep = { a: { b: { c: { d: { e: 'too far' } } } } };
		const out = redactPayload(deep) as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
		expect(out.a!.b!.c!.d).toBe('[depth-limit]');
	});

	it('summarises binary blobs rather than inlining them', () => {
		expect(redactPayload(new Uint8Array(1024))).toBe('[binary 1024 bytes]');
	});

	it('normalises errors, dates and non-finite numbers', () => {
		expect(redactPayload(new Error('boom'))).toEqual({ name: 'Error', message: 'boom' });
		expect(redactPayload(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
		expect(redactPayload(NaN)).toBe('NaN');
	});
});

describe('serializePayload', () => {
	it('returns the redacted structure when it fits', () => {
		expect(serializePayload({ itemId: 'abc' })).toEqual({ itemId: 'abc' });
	});

	it('truncates a payload that would not fit the audit row', () => {
		const big = { items: Array.from({ length: 24 }, () => 'y'.repeat(500)) };
		const out = serializePayload(big) as { truncated: boolean; preview: string };
		expect(out.truncated).toBe(true);
		expect(out.preview.length).toBe(8000);
	});

	it('survives a circular payload — the depth limit cuts the cycle', () => {
		const circular: Record<string, unknown> = { a: 1 };
		circular.self = circular;
		expect(serializePayload(circular)).toEqual({
			a: 1,
			self: { a: 1, self: { a: 1, self: { a: 1, self: '[depth-limit]' } } },
		});
	});

	it('maps undefined to null so the column stays writable', () => {
		expect(serializePayload(undefined)).toBeNull();
	});
});

describe('describeError', () => {
	it('keeps the message and a bounded stack', () => {
		const err = new Error('boom');
		const described = describeError(err);
		expect(described.message).toBe('boom');
		expect(described.stack?.length).toBeLessThanOrEqual(4000);
	});

	it('redacts an email leaked into the message', () => {
		expect(describeError(new Error('no user for chef@example.com')).message)
			.toBe('no user for [redacted]');
	});

	it('handles non-Error throws', () => {
		expect(describeError('plain string').message).toBe('plain string');
		expect(describeError({ weird: true }).message).toBe('{"weird":true}');
	});
});

describe('runJob', () => {
	it('runs a tenant job inside its tenant context', async () => {
		tenantRuns.length = 0;
		const result = await runJob({ name: 'q', id: 'job-1', data: { restaurantId: 'rest-1' } }, async () => 'ok');
		expect(result).toBe('ok');
		expect(tenantRuns).toEqual(['rest-1']);
	});

	it('runs a job without a tenant outside any tenant context', async () => {
		tenantRuns.length = 0;
		await runJob({ name: 'q', id: 'job-2', data: { restaurantId: null } }, async () => 'ok');
		expect(tenantRuns).toEqual([]);
	});

	it('rethrows so pg-boss retries the job, then marks it failed', async () => {
		await expect(
			runJob({ name: 'q', id: 'job-3', data: {} }, async () => {
				throw new Error('transient');
			}),
		).rejects.toThrow('transient');
	});
});
