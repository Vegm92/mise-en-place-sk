import path from 'path';
import { randomBytes } from 'crypto';
import { UPLOADS_DIR } from './env';
import { getStorage } from './storage';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.xml']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function looksLikeXml(b: Buffer): boolean {
	let start = 0;
	if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) start = 3; // UTF-8 BOM
	while (start < b.length && (b[start] === 0x20 || b[start] === 0x09 || b[start] === 0x0A || b[start] === 0x0D)) start++;
	return b[start] === 0x3C; // '<'
}

const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
	'.pdf':  (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D,
	'.jpg':  (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
	'.jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
	'.png':  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A,
	'.xml':  looksLikeXml,
};

export function uploadsDir(): string {
	return path.resolve(process.cwd(), UPLOADS_DIR);
}

export async function deleteUploadFile(key: string): Promise<void> {
	await getStorage().delete(key);
}

export interface RejectedUpload {
	name: string;
	reason: 'unsupportedType' | 'tooLarge' | 'contentMismatch';
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
