import path from 'path';
import { randomBytes } from 'crypto';
import { UPLOADS_DIR } from './env';
import { getStorage } from './storage';
import {
	ALLOWED_EXTENSIONS,
	MAGIC_BYTES,
	MAX_FILE_BYTES,
	MAX_ZIP_BYTES,
	MIN_FILE_BYTES,
	type RejectReason,
} from './file-validation';
import { extractZip } from './zip-extract';

export { ALLOWED_EXTENSIONS, MAGIC_BYTES };

export function uploadsDir(): string {
	return path.resolve(process.cwd(), UPLOADS_DIR);
}

export async function deleteUploadFile(key: string): Promise<void> {
	await getStorage().delete(key);
}

export interface RejectedUpload {
	name: string;
	reason: RejectReason;
	ext?: string;
}

async function saveEntry(
	name: string,
	size: number,
	buf: Buffer,
	namespace: string,
	storage: ReturnType<typeof getStorage>,
): Promise<{ filename: string; key: string } | RejectedUpload> {
	const ext = path.extname(name).toLowerCase();
	if (!ALLOWED_EXTENSIONS.has(ext) || ext === '.zip') return { name, reason: 'unsupportedType', ext };
	if (size > MAX_FILE_BYTES) return { name, reason: 'tooLarge' };
	if (size < MIN_FILE_BYTES) return { name, reason: 'tooSmall' };
	const magicCheck = MAGIC_BYTES[ext];
	if (magicCheck && !magicCheck(buf)) return { name, reason: 'contentMismatch' };

	const stem = path.basename(name, ext);
	const suffix = randomBytes(3).toString('hex');
	const filename = `${stem}_${suffix}${ext}`;
	const key = `${namespace}/${filename}`;
	await storage.save(key, buf);
	return { filename, key };
}

async function saveZipEntries(
	file: File,
	namespace: string,
	storage: ReturnType<typeof getStorage>,
): Promise<{ saved: string[]; keys: string[]; errors: RejectedUpload[] }> {
	const saved: string[] = [];
	const keys: string[] = [];
	const errors: RejectedUpload[] = [];

	if (file.size > MAX_ZIP_BYTES) {
		errors.push({ name: file.name, reason: 'tooLarge' });
		return { saved, keys, errors };
	}
	const buf = Buffer.from(await file.arrayBuffer());
	if (!MAGIC_BYTES['.zip']?.(buf)) {
		errors.push({ name: file.name, reason: 'contentMismatch' });
		return { saved, keys, errors };
	}

	const extraction = await extractZip(buf);
	for (const zerr of extraction.errors) {
		errors.push({ name: zerr.name ? `${file.name}/${zerr.name}` : file.name, reason: zerr.reason });
	}
	for (const entry of extraction.files) {
		const result = await saveEntry(entry.name, entry.buffer.length, entry.buffer, namespace, storage);
		if ('reason' in result) {
			errors.push({ ...result, name: `${file.name}/${result.name}` });
		} else {
			saved.push(result.filename);
			keys.push(result.key);
		}
	}

	return { saved, keys, errors };
}

export async function saveUploadedFiles(
	files: File[],
	namespace: string,
): Promise<{ saved: string[]; keys: string[]; errors: RejectedUpload[] }> {
	const storage = getStorage();
	const saved: string[] = [];
	const keys: string[] = [];
	const errors: RejectedUpload[] = [];

	for (const file of files) {
		if (!file.name) continue;
		const ext = path.extname(file.name).toLowerCase();

		if (ext === '.zip') {
			const zipResult = await saveZipEntries(file, namespace, storage);
			saved.push(...zipResult.saved);
			keys.push(...zipResult.keys);
			errors.push(...zipResult.errors);
			continue;
		}

		const buf = Buffer.from(await file.arrayBuffer());
		const result = await saveEntry(file.name, file.size, buf, namespace, storage);
		if ('reason' in result) {
			errors.push(result);
		} else {
			saved.push(result.filename);
			keys.push(result.key);
		}
	}

	return { saved, keys, errors };
}

export function localFilePath(key: string): string {
	return path.join(uploadsDir(), key);
}
