import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpRoot: string;
let uploadsDir: string;
let previousUploadsDir: string | undefined;
let storage: { save(key: string, buf: Buffer): Promise<void> };

beforeEach(async () => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mep-storage-test-'));
	uploadsDir = path.join(tmpRoot, 'uploads');
	previousUploadsDir = process.env.UPLOADS_DIR;
	process.env.UPLOADS_DIR = uploadsDir;
	vi.resetModules();
	const mod = await import('../src/lib/server/storage.js');
	storage = mod.getStorage();
});

afterEach(() => {
	if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR;
	else process.env.UPLOADS_DIR = previousUploadsDir;
	vi.resetModules();
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('LocalDriver.save() path containment (issue #468)', () => {
	it('saves a normal key under the uploads base', async () => {
		await storage.save('abc123/invoice.pdf', Buffer.from('hello'));
		const dest = path.join(uploadsDir, 'abc123/invoice.pdf');
		expect(fs.readFileSync(dest, 'utf8')).toBe('hello');
	});

	it('rejects a ../-bearing key and writes nothing', async () => {
		const escapeTarget = path.join(tmpRoot, 'evil.txt');

		await expect(
			storage.save('../evil.txt', Buffer.from('pwned')),
		).rejects.toThrow('Invalid storage key');

		expect(fs.existsSync(escapeTarget)).toBe(false);
		expect(fs.existsSync(uploadsDir)).toBe(false);
	});

	it('rejects a key that escapes into a sibling directory sharing the base as a string prefix', async () => {
		const escapeTarget = path.join(tmpRoot, 'uploads-evil', 'evil.txt');

		await expect(
			storage.save('../uploads-evil/evil.txt', Buffer.from('pwned')),
		).rejects.toThrow('Invalid storage key');

		expect(fs.existsSync(escapeTarget)).toBe(false);
	});
});
