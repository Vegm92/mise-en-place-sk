import path from 'path';
import { randomBytes } from 'crypto';
import { UPLOADS_DIR } from './env';
import { getStorage } from './storage';
import { ALLOWED_EXTENSIONS, MAGIC_BYTES, MAX_FILE_BYTES, type RejectReason } from './file-validation';

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
		if (!ALLOWED_EXTENSIONS.has(ext)) {
			errors.push({ name: file.name, reason: 'unsupportedType', ext });
			continue;
		}
		if (file.size > MAX_FILE_BYTES) {
			errors.push({ name: file.name, reason: 'tooLarge' });
			continue;
		}

		const stem = path.basename(file.name, ext);
		const suffix = randomBytes(3).toString('hex');
		const filename = `${stem}_${suffix}${ext}`;
		const key = `${namespace}/${filename}`;

		const buf = Buffer.from(await file.arrayBuffer());
		const magicCheck = MAGIC_BYTES[ext];
		if (magicCheck && !magicCheck(buf)) {
			errors.push({ name: file.name, reason: 'contentMismatch' });
			continue;
		}
		await storage.save(key, buf);
		saved.push(filename);
		keys.push(key);
	}

	return { saved, keys, errors };
}

export function localFilePath(key: string): string {
	return path.join(uploadsDir(), key);
}
