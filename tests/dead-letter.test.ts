/**
 * Dead letter queue — pure helpers and the worker wrapper.
 *
 * The point of the DLQ is that a corrupt record never blocks the pipeline, so
 * the behaviour under test is: what gets redacted before it is persisted, how a
 * failure is classified, and — most importantly — that recording a dead letter
 * cannot itself throw, and that the wrapper still lets pg-boss retry while the
 * job has attempts left.
 *
 * db is mocked; the DB-backed store behaviour lives in dead-letter-db.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({
	state: {
		inserted: [] as Record<string, unknown>[],
		updated: [] as Record<string, unknown>[],
		// rows the UPDATE (dedupe) leg resolves with, in call order; [] = no match
		updateReturns: [] as Array<Array<{ id: number }>>,
		failInsert: false,
	},
}));

vi.mock('$lib/server/db', () => {
	const db = {
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				returning: async () => {
					if (state.failInsert) throw new Error('db down');
					state.inserted.push(values);
					return [{ id: state.inserted.length }];
				},
			}),
		}),
		update: () => ({
			set: (values: Record<string, unknown>) => ({
				where: () => ({
					returning: async () => {
						state.updated.push(values);
						return state.updateReturns.shift() ?? [];
					},
				}),
			}),
		}),
	};
	return { db, forTenant: (rid: string) => ({ rid, scope: () => undefined }) };
});

import {
	classifyDeadLetterError,
	deadLetterRefFromJob,
	describeError,
	recordDeadLetter,
	redactPayload,
	redactString,
	runWithDeadLetter,
	serializePayload,
} from '../src/lib/server/dead-letter';

beforeEach(() => {
	state.inserted = [];
	state.updated = [];
	state.updateReturns = [];
	state.failInsert = false;
});

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
		expect(out.raw.startsWith('x'.repeat(512))).toBe(true);
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
		expect(out.a.b.c.d).toBe('[depth-limit]');
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

describe('classifyDeadLetterError', () => {
	it('recognises the extractor s invalid-JSON failure as a corrupt record', () => {
		expect(classifyDeadLetterError(new Error('LLM returned invalid JSON (412 chars)')))
			.toBe('corrupt.invalidJson');
	});

	it('recognises an unparseable e-invoice as a corrupt record', () => {
		expect(classifyDeadLetterError(new Error('Unrecognised XML e-invoice format (not Facturae 3.2.x or UBL 2.1)')))
			.toBe('corrupt.unknownEinvoiceFormat');
	});

	it('recognises a missing source file', () => {
		expect(classifyDeadLetterError(new Error('ENOENT: no such file or directory'))).toBe('corrupt.missingFile');
	});

	it('falls back to the error code, then the HTTP status, then the name', () => {
		expect(classifyDeadLetterError(Object.assign(new Error('nope'), { code: 'GEMINI_TIMEOUT' })))
			.toBe('error.GEMINI_TIMEOUT');
		expect(classifyDeadLetterError(Object.assign(new Error('nope'), { status: 503 })))
			.toBe('error.http503');
		expect(classifyDeadLetterError(new TypeError('nope'))).toBe('error.TypeError');
		expect(classifyDeadLetterError(null)).toBe('error.unknown');
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

describe('deadLetterRefFromJob', () => {
	it('reads the tenant and batch item out of an extraction job', () => {
		const ref = deadLetterRefFromJob('extract-invoice', {
			id: 'job-1',
			data: { itemId: 'item-9', restaurantId: 'rest-1' },
			retryCount: 1,
			retryLimit: 2,
		});
		expect(ref).toMatchObject({
			queue: 'extract-invoice',
			jobId: 'job-1',
			restaurantId: 'rest-1',
			sourceId: 'item-9',
			attempt: 2,
			retriesLeft: 1,
		});
	});

	it('derives a composite source id for a normalize job', () => {
		const ref = deadLetterRefFromJob('normalize-product', {
			id: 'job-2',
			data: { restaurantId: 'rest-1', productId: 42 },
			retryCount: 1,
			retryLimit: 1,
		});
		expect(ref.sourceId).toBe('rest-1:42');
		expect(ref.retriesLeft).toBe(0);
	});

	it('never reports negative retries left', () => {
		const ref = deadLetterRefFromJob('extract-invoice', { data: {}, retryCount: 5, retryLimit: 2 });
		expect(ref.retriesLeft).toBe(0);
		expect(ref.sourceId).toBeNull();
	});
});

describe('runWithDeadLetter', () => {
	it('returns the handler result untouched on success', async () => {
		const result = await runWithDeadLetter({ queue: 'q' }, async () => 'ok');
		expect(result).toBe('ok');
		expect(state.inserted).toHaveLength(0);
	});

	it('rethrows while the job still has retries, so pg-boss retries it', async () => {
		await expect(
			runWithDeadLetter({ queue: 'q', retriesLeft: 1 }, async () => {
				throw new Error('transient');
			}),
		).rejects.toThrow('transient');
		expect(state.inserted).toHaveLength(0);
	});

	it('parks the job and swallows the error once retries are exhausted', async () => {
		const result = await runWithDeadLetter(
			{ queue: 'extract-invoice', jobId: 'job-1', sourceId: 'item-9', restaurantId: 'rest-1', retriesLeft: 0 },
			async () => {
				throw new Error('LLM returned invalid JSON (10 chars)');
			},
		);

		expect(result).toBeUndefined();
		expect(state.inserted).toHaveLength(1);
		expect(state.inserted[0]).toMatchObject({
			queue: 'extract-invoice',
			jobId: 'job-1',
			sourceId: 'item-9',
			restaurantId: 'rest-1',
			errorClass: 'corrupt.invalidJson',
		});
	});
});

describe('recordDeadLetter', () => {
	it('bumps an existing pending entry instead of inserting a duplicate', async () => {
		state.updateReturns = [[{ id: 77 }]];
		const id = await recordDeadLetter({
			queue: 'extract-invoice',
			sourceId: 'item-9',
			errorClass: 'corrupt.invalidJson',
			error: new Error('again'),
		});
		expect(id).toBe(77);
		expect(state.inserted).toHaveLength(0);
		expect(state.updated).toHaveLength(1);
	});

	it('inserts when there is no source id to dedupe on', async () => {
		const id = await recordDeadLetter({ queue: 'scheduled-weekly-digest', error: new Error('boom') });
		expect(id).toBe(1);
		expect(state.updated).toHaveLength(0);
		expect(state.inserted).toHaveLength(1);
	});

	it('never throws when the database is down — the pipeline must keep moving', async () => {
		state.failInsert = true;
		await expect(recordDeadLetter({ queue: 'extract-invoice', error: new Error('boom') }))
			.resolves.toBeNull();
	});
});
