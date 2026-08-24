/**
 * WhatsApp job codes — the short handle that binds an `OK`/`NO` reply to one
 * invoice.
 *
 * A sender can have several invoices in flight at once, so the summary carries
 * a 4-character code and the reply names it. Codes are unique only among OPEN
 * jobs (review_status null or 'pending'), which is what the partial unique
 * index in migration 0042 enforces — once a job is answered its code is free
 * to be handed out again, so a 30-character alphabet does not run out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, selectQueue, updateQueue } = vi.hoisted(() => {
	const selectQueue: unknown[][] = [];
	const updateQueue: unknown[][] = [];

	function chain(result: unknown) {
		const c: unknown = new Proxy({}, {
			get(_t, prop) {
				if (prop === 'then') {
					return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
						Promise.resolve(result).then(res, rej);
				}
				if (typeof prop === 'symbol') return undefined;
				return () => c;
			},
		});
		return c;
	}

	return {
		dbMock: {
			select: vi.fn(() => chain(selectQueue.length ? selectQueue.shift() : [])),
			update: vi.fn(() => chain(updateQueue.length ? updateQueue.shift() : [])),
		},
		selectQueue,
		updateQueue,
	};
});

vi.mock('../src/lib/server/db', () => ({ db: dbMock }));
vi.mock('../src/lib/server/env', async (importActual) => ({
	...(await importActual<typeof import('../src/lib/server/env')>()),
	APP_BASE_URL: 'https://app.example.com',
}));

import {
	batchLink, findJobByCode, generateJobCode, normalizeJobCode, pendingJobsFor,
	randomJobCode, setReviewStatus,
} from '../src/lib/server/integrations/whatsapp/jobs';
import { CODE_ALPHABET } from '../src/lib/server/whatsapp-pairing';

beforeEach(() => {
	vi.clearAllMocks();
	selectQueue.length = 0;
	updateQueue.length = 0;
});

describe('job codes', () => {
	it('draws 4 characters from the pairing alphabet', () => {
		for (let i = 0; i < 50; i++) {
			const code = randomJobCode();
			expect(code).toHaveLength(4);
			for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
		}
	});

	it('never contains a character that reads as another one', () => {
		// 0/O and 1/I/L are the pairs a chef copying a code off a phone screen
		// gets wrong, so the shared alphabet omits them — along with S, which
		// is the one the pairing codes drop in favour of keeping 5.
		for (const ch of '01ILOS') expect(CODE_ALPHABET).not.toContain(ch);
	});

	it('accepts a code typed in lower case or with punctuation around it', () => {
		expect(normalizeJobCode('a7k2')).toBe('A7K2');
		expect(normalizeJobCode(' A7-K2 ')).toBe('A7K2');
	});

	it('rejects anything that is not a code', () => {
		expect(normalizeJobCode('A7K')).toBeNull();
		expect(normalizeJobCode('A7K22')).toBeNull();
		expect(normalizeJobCode('A0K2')).toBeNull();
		expect(normalizeJobCode('')).toBeNull();
	});

	it('hands out a code that no open job is using', async () => {
		selectQueue.push([]);
		const code = await generateJobCode();
		expect(code).toHaveLength(4);
		expect(dbMock.select).toHaveBeenCalledTimes(1);
	});

	it('retries when the first candidate is already taken by an open job', async () => {
		selectQueue.push([{ id: 'item-1' }], []);
		await generateJobCode();
		expect(dbMock.select).toHaveBeenCalledTimes(2);
	});

	it('gives up rather than looping forever when every candidate collides', async () => {
		for (let i = 0; i < 6; i++) selectQueue.push([{ id: 'taken' }]);
		await expect(generateJobCode()).rejects.toThrow(/job code/i);
	});
});

describe('job lookup', () => {
	const JOB = {
		id: 'item-1', batchId: 'batch-1', restaurantId: 'rest-1', jobCode: 'A7K2',
		status: 'done', reviewStatus: 'pending', extractedData: {}, displayName: 'f.jpg',
	};

	it('finds an open job by its code for the number that sent it', async () => {
		selectQueue.push([JOB]);
		expect(await findJobByCode('34600', 'a7k2')).toEqual(JOB);
	});

	it('does not hit the database for a code-shaped-but-invalid reply', async () => {
		expect(await findJobByCode('34600', 'nope!')).toBeNull();
		expect(dbMock.select).not.toHaveBeenCalled();
	});

	it('returns null when the code belongs to nobody', async () => {
		selectQueue.push([]);
		expect(await findJobByCode('34600', 'A7K2')).toBeNull();
	});

	it('lists the sender\'s jobs still waiting for an answer', async () => {
		selectQueue.push([JOB, { ...JOB, id: 'item-2', jobCode: 'B3M9' }]);
		expect(await pendingJobsFor('34600')).toHaveLength(2);
	});
});

describe('review-status transition', () => {
	it('reports the move when a row actually changed', async () => {
		updateQueue.push([{ id: 'item-1' }]);
		expect(await setReviewStatus('item-1', 'reviewed', ['pending'])).toBe(true);
	});

	it('reports no move when the job was already answered', async () => {
		// The guarded UPDATE is what makes a duplicate OK idempotent: the second
		// one matches no row, so no second notification is raised.
		updateQueue.push([]);
		expect(await setReviewStatus('item-1', 'reviewed', ['pending'])).toBe(false);
	});
});

describe('batchLink', () => {
	it('builds an absolute link when APP_BASE_URL is configured', () => {
		expect(batchLink('batch-1')).toBe('https://app.example.com/batch/batch-1');
	});
});
