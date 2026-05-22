import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { SK_SESSIONS_DIR, UPLOADS_DIR } from './env';

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

function sessionsDir(): string {
	return path.resolve(process.cwd(), SK_SESSIONS_DIR);
}

function sessionPath(id: string): string {
	return path.join(sessionsDir(), `${id}.json`);
}

export function readSession(id: string): Session | null {
	const fp = sessionPath(id);
	try {
		const raw = fs.readFileSync(fp, 'utf-8');
		return JSON.parse(raw) as Session;
	} catch {
		return null;
	}
}

export function writeSession(session: Session): void {
	const dir = sessionsDir();
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(sessionPath(session.id), JSON.stringify(session), 'utf-8');
}

export function deleteSession(id: string): void {
	const fp = sessionPath(id);
	try {
		fs.unlinkSync(fp);
	} catch {
		// file may already be gone
	}
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

export function cleanupStaleSessions(): void {
	const dir = sessionsDir();
	try {
		const entries = fs.readdirSync(dir);
		const cutoff = Date.now() - 24 * 60 * 60 * 1000;
		for (const entry of entries) {
			if (!entry.endsWith('.json')) continue;
			const fp = path.join(dir, entry);
			try {
				const stat = fs.statSync(fp);
				if (stat.mtimeMs < cutoff) {
					fs.unlinkSync(fp);
				}
			} catch {
				// ignore individual errors
			}
		}
	} catch {
		// dir may not exist yet
	}
}
