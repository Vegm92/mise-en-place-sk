import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { UPLOADS_DIR } from './env';
import { db } from './db';
import { uploadSessions } from './schema';
import { eq, lt } from 'drizzle-orm';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function uploadsDir(): string {
	return path.resolve(process.cwd(), UPLOADS_DIR);
}

export function resolveUploadPath(filename: string): string {
	const dir = uploadsDir();
	const fp = path.resolve(dir, filename);
	if (!fp.startsWith(dir + path.sep) && fp !== dir) throw new Error('Invalid file path');
	return fp;
}

export function deleteUploadFile(filename: string): void {
	try {
		const fp = resolveUploadPath(filename);
		if (fs.existsSync(fp)) fs.unlinkSync(fp);
	} catch {
		// ignore — file may already be gone or path invalid
	}
}

export interface Session {
	id: string;
	files: string[];
	extractedData?: Record<string, unknown>;
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

export async function saveUploadedFiles(files: File[]): Promise<{ saved: string[]; errors: string[] }> {
	const dir = uploadsDir();
	fs.mkdirSync(dir, { recursive: true });
	const saved: string[] = [];
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
		let dest = path.join(dir, file.name);
		if (fs.existsSync(dest)) {
			const suffix = randomBytes(3).toString('hex');
			const stem = path.basename(file.name, ext);
			dest = path.join(dir, `${stem}_${suffix}${ext}`);
		}
		const buf = Buffer.from(await file.arrayBuffer());
		fs.writeFileSync(dest, buf);
		saved.push(path.basename(dest));
	}

	return { saved, errors };
}
