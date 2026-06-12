/**
 * Upload file helpers — validation, storage-key generation, and local-path
 * resolution for uploaded invoice files. Batch/queue state lives in batch.ts;
 * the legacy JSON-blob session store this module once held is gone.
 */
import path from 'path';
import { randomBytes } from 'crypto';
import { UPLOADS_DIR } from './env';
import { getStorage } from './storage';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Local uploads directory — used by the local storage driver and for file stat display. */
export function uploadsDir(): string {
	return path.resolve(process.cwd(), UPLOADS_DIR);
}

export async function deleteUploadFile(key: string): Promise<void> {
	await getStorage().delete(key);
}

/**
 * Save uploaded files using the configured storage driver.
 *
 * @param files   Files to save.
 * @param namespace  Prefix for storage keys, typically the batch ID.
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
 * Used only for file stat display on the batch page.
 */
export function localFilePath(key: string): string {
	return path.join(uploadsDir(), key);
}
