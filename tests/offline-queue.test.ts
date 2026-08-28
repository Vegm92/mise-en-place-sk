import { describe, expect, it, vi } from 'vitest';
import {
	OFFLINE_QUEUE_MAX_ATTEMPTS,
	OFFLINE_QUEUE_TTL_MS,
	backoffMs,
	clearOfflineQueue,
	enqueueFiles,
	isExpired,
	isRetryDue,
	normalizeRecord,
	queueCount,
	retryOfflineQueue,
	sweepExpiredEntries,
	type OfflineQueueRecord,
	type OfflineQueueStorage,
} from '../src/lib/offline-queue';

class FakeOfflineQueueStorage implements OfflineQueueStorage {
	private nextId = 1;
	private records = new Map<number, unknown>();

	seed(record: { id?: number } & Record<string, unknown>): number {
		const id = record.id ?? this.nextId++;
		this.nextId = Math.max(this.nextId, id + 1);
		this.records.set(id, { ...record, id });
		return id;
	}

	async getAll() {
		return [...this.records.values()] as unknown as OfflineQueueRecord[];
	}

	async add(record: Omit<OfflineQueueRecord, 'id'>) {
		const id = this.nextId++;
		this.records.set(id, { ...record, id });
	}

	async put(record: OfflineQueueRecord) {
		this.records.set(record.id, record);
	}

	async delete(id: number) {
		this.records.delete(id);
	}

	async clear() {
		this.records.clear();
	}
}

function newRecord(overrides: Partial<Omit<OfflineQueueRecord, 'id'>> = {}) {
	return {
		name: 'invoice.pdf',
		type: 'application/pdf',
		blob: new Blob(['x']),
		timestamp: Date.now(),
		attempts: 0,
		nextRetryAt: 0,
		...overrides,
	};
}

describe('sweepExpiredEntries', () => {
	it('drops entries older than the TTL and keeps recent ones', async () => {
		const storage = new FakeOfflineQueueStorage();
		const now = Date.now();
		storage.seed(newRecord({ name: 'old.pdf', timestamp: now - OFFLINE_QUEUE_TTL_MS - 1000 }));
		storage.seed(newRecord({ name: 'recent.pdf', timestamp: now - 1000 }));

		const result = await sweepExpiredEntries(storage, now);

		expect(result.dropped).toBe(1);
		expect(result.remaining).toHaveLength(1);
		expect(result.remaining[0].name).toBe('recent.pdf');
		expect(await queueCount(storage)).toBe(1);
	});

	it('does not drop an entry exactly at the TTL boundary', async () => {
		const storage = new FakeOfflineQueueStorage();
		const now = Date.now();
		storage.seed(newRecord({ timestamp: now - OFFLINE_QUEUE_TTL_MS }));

		const result = await sweepExpiredEntries(storage, now);

		expect(result.dropped).toBe(0);
		expect(isExpired({ ...newRecord(), timestamp: now - OFFLINE_QUEUE_TTL_MS } as OfflineQueueRecord, now)).toBe(false);
	});
});

describe('retryOfflineQueue — attempts cap', () => {
	it('drops an entry once it exceeds the attempts cap and counts it as dropped', async () => {
		const storage = new FakeOfflineQueueStorage();
		const now = Date.now();
		storage.seed(newRecord({ attempts: OFFLINE_QUEUE_MAX_ATTEMPTS - 1 }));

		const upload = vi.fn(async () => ({ status: 'rejected' as const }));
		const result = await retryOfflineQueue(storage, upload, now);

		expect(upload).toHaveBeenCalledTimes(1);
		expect(result.droppedFailed).toBe(1);
		expect(await queueCount(storage)).toBe(0);
	});

	it('keeps an entry under the cap, incrementing attempts and scheduling a backoff window', async () => {
		const storage = new FakeOfflineQueueStorage();
		const now = Date.now();
		const id = storage.seed(newRecord({ attempts: 0 }));

		const upload = vi.fn(async () => ({ status: 'rejected' as const }));
		const result = await retryOfflineQueue(storage, upload, now);

		expect(result.droppedFailed).toBe(0);
		const stored = (await storage.getAll())[0] as OfflineQueueRecord;
		expect(stored.id).toBe(id);
		expect(stored.attempts).toBe(1);
		expect(stored.nextRetryAt).toBe(now + backoffMs(1));
	});
});

describe('retryOfflineQueue — backoff gating', () => {
	it('skips an entry whose backoff window has not elapsed', async () => {
		const storage = new FakeOfflineQueueStorage();
		const now = Date.now();
		storage.seed(newRecord({ attempts: 1, nextRetryAt: now + 60_000 }));

		const upload = vi.fn(async () => ({ status: 'success' as const, location: '/confirm/1' }));
		const result = await retryOfflineQueue(storage, upload, now);

		expect(upload).not.toHaveBeenCalled();
		expect(result.location).toBeNull();
		expect(result.remaining).toBe(1);
	});

	it('retries an entry once its backoff window has elapsed', async () => {
		const storage = new FakeOfflineQueueStorage();
		const now = Date.now();
		storage.seed(newRecord({ attempts: 1, nextRetryAt: now - 1 }));

		const upload = vi.fn(async () => ({ status: 'success' as const, location: '/confirm/1' }));
		const result = await retryOfflineQueue(storage, upload, now);

		expect(upload).toHaveBeenCalledTimes(1);
		expect(result.location).toBe('/confirm/1');
		expect(result.remaining).toBe(0);
	});

	it('stops the sweep and flags stillOffline on a network error, leaving later items untouched', async () => {
		const storage = new FakeOfflineQueueStorage();
		const now = Date.now();
		storage.seed(newRecord({ name: 'first.pdf', attempts: 0 }));
		storage.seed(newRecord({ name: 'second.pdf', attempts: 0 }));

		const upload = vi.fn(async () => { throw new Error('offline'); });
		const result = await retryOfflineQueue(storage, upload, now);

		expect(upload).toHaveBeenCalledTimes(1);
		expect(result.stillOffline).toBe(true);
		expect(result.location).toBeNull();
		expect(result.remaining).toBe(2);
	});
});

describe('backoffMs', () => {
	it('grows exponentially and caps at the maximum window', () => {
		expect(backoffMs(1)).toBe(30_000);
		expect(backoffMs(2)).toBe(60_000);
		expect(backoffMs(3)).toBe(120_000);
		expect(backoffMs(10)).toBe(30 * 60 * 1000);
	});
});

describe('base64 compat migration', () => {
	it('converts a legacy base64 record into a Blob-backed record without crashing', () => {
		const base64 = Buffer.from('hello').toString('base64');
		const legacy = {
			id: 5,
			name: 'old.pdf',
			type: 'application/pdf',
			data: `data:application/pdf;base64,${base64}`,
			timestamp: Date.now(),
		};

		const normalized = normalizeRecord(legacy);

		expect(normalized.id).toBe(5);
		expect(normalized.blob).toBeInstanceOf(Blob);
		expect(normalized.blob.size).toBe(5);
		expect(normalized.attempts).toBe(0);
		expect(normalized.nextRetryAt).toBe(0);
	});

	it('leaves an already-migrated record untouched', () => {
		const record = { ...newRecord({ attempts: 2, nextRetryAt: 123 }), id: 1 } as OfflineQueueRecord;
		expect(normalizeRecord(record)).toEqual(record);
	});

	it('migrates a legacy queued item on retry and uploads it exactly once', async () => {
		const storage = new FakeOfflineQueueStorage();
		const now = Date.now();
		const base64 = Buffer.from('legacy-bytes').toString('base64');
		storage.seed({
			name: 'legacy.pdf',
			type: 'application/pdf',
			data: `data:application/pdf;base64,${base64}`,
			timestamp: now,
		});

		const upload = vi.fn(async (file: File) => {
			expect(file).toBeInstanceOf(File);
			expect(file.name).toBe('legacy.pdf');
			return { status: 'success' as const, location: '/confirm/1' };
		});

		const result = await retryOfflineQueue(storage, upload, now);

		expect(upload).toHaveBeenCalledTimes(1);
		expect(result.location).toBe('/confirm/1');
		expect(await queueCount(storage)).toBe(0);
	});
});

describe('enqueueFiles', () => {
	it('stores files as Blobs, not base64 strings', async () => {
		const storage = new FakeOfflineQueueStorage();
		const file = new File([new Uint8Array([1, 2, 3])], 'a.pdf', { type: 'application/pdf' });

		await enqueueFiles(storage, [file], Date.now());

		const [record] = (await storage.getAll()) as OfflineQueueRecord[];
		expect(record.blob).toBeInstanceOf(Blob);
		expect('data' in record).toBe(false);
		expect(record.attempts).toBe(0);
		expect(record.nextRetryAt).toBe(0);
	});
});

describe('clearOfflineQueue', () => {
	it('empties every queued entry, for use on logout', async () => {
		const storage = new FakeOfflineQueueStorage();
		storage.seed(newRecord({ name: 'a.pdf' }));
		storage.seed(newRecord({ name: 'b.pdf' }));

		await clearOfflineQueue(storage);

		expect(await queueCount(storage)).toBe(0);
	});
});

describe('isRetryDue', () => {
	it('is due when nextRetryAt is now or in the past', () => {
		const now = Date.now();
		expect(isRetryDue({ ...newRecord(), id: 1, nextRetryAt: now } as OfflineQueueRecord, now)).toBe(true);
		expect(isRetryDue({ ...newRecord(), id: 1, nextRetryAt: now + 1 } as OfflineQueueRecord, now)).toBe(false);
	});
});
