import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { UPLOADS_DIR } from './env';
import { db } from './db';
import { uploadSessions } from './schema';
import { eq, lt } from 'drizzle-orm';
import { getStorage } from './storage';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Local uploads directory — used by the local storage driver and for file stat display. */
export function uploadsDir(): string {
	return path.resolve(process.cwd(), UPLOADS_DIR);
}

export interface Session {
	id: string;
	files: string[];
	/** Storage keys parallel to `files`. Added for new uploads; absent on legacy sessions. */
	fileKeys?: string[];
	extractedData?: Record<string, unknown>;
	conversionNotes?: string[];
	extractionStatus?: 'queued' | 'extracting' | 'done' | 'failed';
	extractError?: string;
	invoiceIndex?: number;
	totalInvoices?: number;
	remaining?: string[];
}

export async function readSession(id: string): Promise<Session | null> {
	try {
		const rows = await db.select({ data: uploadSessions.data })
			.from(uploadSessions)
			.where(eq(uploadSessions.id, id))
			.limit(1);
		if (!rows.length) return null;
		return JSON.parse(rows[0].data) as Session;
	} catch {
		return null;
	}
}

export async function writeSession(session: Session): Promise<void> {
	const now = new Date();
	await db.insert(uploadSessions)
		.values({ id: session.id, data: JSON.stringify(session), updatedAt: now })
		.onConflictDoUpdate({
			target: uploadSessions.id,
			set: { data: JSON.stringify(session), updatedAt: now },
		});
}

export async function deleteSession(id: string): Promise<void> {
	await db.delete(uploadSessions).where(eq(uploadSessions.id, id));
}

export async function cleanupStaleSessions(): Promise<void> {
	const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
	await db.delete(uploadSessions).where(lt(uploadSessions.updatedAt, cutoff));
}

export async function deleteUploadFile(key: string): Promise<void> {
	await getStorage().delete(key);
}

/**
 * Save uploaded files using the configured storage driver.
 *
 * @param files   Files to save.
 * @param namespace  Prefix for storage keys, typically the session ID.
 * @returns saved  Original (display) filenames with a uniqueness suffix.
 * @returns keys   Storage keys (`namespace/filename`) parallel to `saved`.
 * @returns errors Validation errors for rejected files.
 */
export async function saveUploadedFiles(
	files: File[],
	namespace: string,
): Promise<{ saved: string[]; keys: string[]; errors: string[] }> {
	const storage = getStorage();
	const saved: string[] = [];
	const keys: string[] = [];
	const errors: string[] = [];

	for (const file of files) {
		if (!file.name) continue;
		const ext = path.extname(file.name).toLowerCase();
		if (!ALLOWED_EXTENSIONS.has(ext)) {
			errors.push(`'${file.name}': unsupported type '${ext}'`);
			continue;
		}
		if (file.size > MAX_FILE_BYTES) {
			errors.push(`'${file.name}': exceeds the 20 MB limit`);
			continue;
		}

		const stem = path.basename(file.name, ext);
		const suffix = randomBytes(3).toString('hex');
		const filename = `${stem}_${suffix}${ext}`;
		const key = `${namespace}/${filename}`;

		const buf = Buffer.from(await file.arrayBuffer());
		await storage.save(key, buf);
		saved.push(filename);
		keys.push(key);
	}

	return { saved, keys, errors };
}

/**
 * Returns the local filesystem path for a storage key when using the local driver.
 * Used only for file stat display in the confirm page.
 */
export function localFilePath(key: string): string {
	return path.join(uploadsDir(), key);
}
