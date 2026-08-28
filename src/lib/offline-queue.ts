export const OFFLINE_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_QUEUE_MAX_ATTEMPTS = 5;
export const OFFLINE_QUEUE_MAX_ITEMS = 3;

const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;

const DB_NAME = 'mise-offline-queue';
const STORE_NAME = 'pending';

export interface OfflineQueueRecord {
	id: number;
	name: string;
	type: string;
	blob: Blob;
	timestamp: number;
	attempts: number;
	nextRetryAt: number;
}

interface LegacyOfflineQueueRecord {
	id: number;
	name: string;
	type: string;
	data: string;
	timestamp: number;
}

type StoredOfflineQueueRecord = OfflineQueueRecord | LegacyOfflineQueueRecord;

export interface OfflineQueueStorage {
	getAll(): Promise<StoredOfflineQueueRecord[]>;
	add(record: Omit<OfflineQueueRecord, 'id'>): Promise<void>;
	put(record: OfflineQueueRecord): Promise<void>;
	delete(id: number): Promise<void>;
	clear(): Promise<void>;
}

export type UploadOutcome =
	| { status: 'success'; location: string }
	| { status: 'rejected' }
	| { status: 'network-error' };

export interface SweepResult {
	dropped: number;
	remaining: OfflineQueueRecord[];
}

export interface RetryQueueResult {
	location: string | null;
	droppedFailed: number;
	stillOffline: boolean;
	remaining: number;
}

export function isLegacyRecord(record: StoredOfflineQueueRecord): record is LegacyOfflineQueueRecord {
	return !('blob' in record);
}

function base64ToBlob(dataUrl: string, type: string): Blob {
	const comma = dataUrl.indexOf(',');
	const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
	return new Blob([bytes], { type });
}

export function normalizeRecord(record: StoredOfflineQueueRecord): OfflineQueueRecord {
	if (!isLegacyRecord(record)) return record;
	return {
		id: record.id,
		name: record.name,
		type: record.type,
		blob: base64ToBlob(record.data, record.type),
		timestamp: record.timestamp,
		attempts: 0,
		nextRetryAt: 0,
	};
}

export function isExpired(record: OfflineQueueRecord, now: number, ttlMs = OFFLINE_QUEUE_TTL_MS): boolean {
	return now - record.timestamp > ttlMs;
}

export function isRetryDue(record: OfflineQueueRecord, now: number): boolean {
	return now >= record.nextRetryAt;
}

export function backoffMs(attempts: number): number {
	const exp = BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1);
	return Math.min(exp, BACKOFF_MAX_MS);
}

async function loadNormalizedQueue(storage: OfflineQueueStorage): Promise<OfflineQueueRecord[]> {
	const records = await storage.getAll();
	const normalized: OfflineQueueRecord[] = [];
	for (const record of records) {
		if (isLegacyRecord(record)) {
			const converted = normalizeRecord(record);
			await storage.put(converted);
			normalized.push(converted);
		} else {
			normalized.push(record);
		}
	}
	return normalized;
}

export async function queueCount(storage: OfflineQueueStorage): Promise<number> {
	return (await storage.getAll()).length;
}

export async function enqueueFiles(
	storage: OfflineQueueStorage,
	files: File[],
	now = Date.now(),
): Promise<void> {
	for (const file of files) {
		await storage.add({ name: file.name, type: file.type, blob: file, timestamp: now, attempts: 0, nextRetryAt: 0 });
	}
}

export async function sweepExpiredEntries(
	storage: OfflineQueueStorage,
	now = Date.now(),
	ttlMs = OFFLINE_QUEUE_TTL_MS,
): Promise<SweepResult> {
	const records = await loadNormalizedQueue(storage);
	const remaining: OfflineQueueRecord[] = [];
	let dropped = 0;
	for (const record of records) {
		if (isExpired(record, now, ttlMs)) {
			await storage.delete(record.id);
			dropped += 1;
		} else {
			remaining.push(record);
		}
	}
	return { dropped, remaining };
}

export async function clearOfflineQueue(storage: OfflineQueueStorage): Promise<void> {
	await storage.clear();
}

export async function retryOfflineQueue(
	storage: OfflineQueueStorage,
	upload: (file: File) => Promise<UploadOutcome>,
	now = Date.now(),
	maxAttempts = OFFLINE_QUEUE_MAX_ATTEMPTS,
): Promise<RetryQueueResult> {
	const records = await loadNormalizedQueue(storage);
	const due = records.filter((record) => isRetryDue(record, now));

	let location: string | null = null;
	let droppedFailed = 0;
	let stillOffline = false;

	for (const record of due) {
		const file = record.blob instanceof File ? record.blob : new File([record.blob], record.name, { type: record.type });
		let outcome: UploadOutcome;
		try {
			outcome = await upload(file);
		} catch {
			outcome = { status: 'network-error' };
		}

		if (outcome.status === 'success') {
			await storage.delete(record.id);
			location = outcome.location;
			break;
		}

		const attempts = record.attempts + 1;
		if (attempts >= maxAttempts) {
			await storage.delete(record.id);
			droppedFailed += 1;
		} else {
			await storage.put({ ...record, attempts, nextRetryAt: now + backoffMs(attempts) });
		}

		if (outcome.status === 'network-error') {
			stillOffline = true;
			break;
		}
	}

	const remaining = await queueCount(storage);
	return { location, droppedFailed, stillOffline, remaining };
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export function createIndexedDbOfflineQueueStorage(): OfflineQueueStorage {
	return {
		async getAll() {
			try {
				const db = await openDb();
				return new Promise((resolve) => {
					const tx = db.transaction(STORE_NAME, 'readonly');
					const req = tx.objectStore(STORE_NAME).getAll();
					req.onsuccess = () => { resolve(req.result); db.close(); };
					req.onerror = () => { resolve([]); db.close(); };
				});
			} catch { return []; }
		},
		async add(record) {
			const db = await openDb();
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction(STORE_NAME, 'readwrite');
				tx.objectStore(STORE_NAME).add(record);
				tx.oncomplete = () => { resolve(); db.close(); };
				tx.onerror = () => { reject(tx.error); db.close(); };
			});
		},
		async put(record) {
			const db = await openDb();
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction(STORE_NAME, 'readwrite');
				tx.objectStore(STORE_NAME).put(record);
				tx.oncomplete = () => { resolve(); db.close(); };
				tx.onerror = () => { reject(tx.error); db.close(); };
			});
		},
		async delete(id) {
			try {
				const db = await openDb();
				await new Promise<void>((resolve) => {
					const tx = db.transaction(STORE_NAME, 'readwrite');
					tx.objectStore(STORE_NAME).delete(id);
					tx.oncomplete = () => { resolve(); db.close(); };
				});
			} catch { }
		},
		async clear() {
			try {
				const db = await openDb();
				await new Promise<void>((resolve) => {
					const tx = db.transaction(STORE_NAME, 'readwrite');
					tx.objectStore(STORE_NAME).clear();
					tx.oncomplete = () => { resolve(); db.close(); };
				});
			} catch { }
		},
	};
}
