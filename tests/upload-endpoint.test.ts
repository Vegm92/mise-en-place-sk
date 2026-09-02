/**
 * Tests for the /api/upload/[id]/[file] endpoint logic.
 * Mirrors the waitlist pattern: extracts the pure guards and tests them
 * without SvelteKit's request/response plumbing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { contentDispositionHeader } from '../src/lib/server/content-disposition';

// ── MIME map (copied from the endpoint) ─────────────────────────────────────
const MIME: Record<string, string> = {
	'.pdf':  'application/pdf',
	'.jpg':  'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png':  'image/png',
	'.webp': 'image/webp',
	'.xml':  'application/xml',
};

function resolveMime(filename: string): string {
	const ext = path.extname(filename).toLowerCase();
	return MIME[ext] ?? 'application/octet-stream';
}

// ── Path-traversal guard (copied from the endpoint) ─────────────────────────
function isPathSafe(dir: string, fp: string): boolean {
	return fp.startsWith(dir + path.sep) || fp === dir;
}

// ── Session file-membership check (the key authorization gate) ──────────────
function isFileInSession(sessionFiles: string[], filename: string): boolean {
	return sessionFiles.includes(filename);
}

// ── MIME type resolution ─────────────────────────────────────────────────────
describe('resolveMime', () => {
	it('returns application/pdf for .pdf', () => {
		expect(resolveMime('invoice.pdf')).toBe('application/pdf');
	});

	it('returns image/jpeg for .jpg', () => {
		expect(resolveMime('scan.jpg')).toBe('image/jpeg');
	});

	it('returns image/jpeg for .jpeg', () => {
		expect(resolveMime('scan.jpeg')).toBe('image/jpeg');
	});

	it('returns image/png for .png', () => {
		expect(resolveMime('photo.png')).toBe('image/png');
	});

	it('falls back to application/octet-stream for unknown extensions', () => {
		expect(resolveMime('data.bin')).toBe('application/octet-stream');
		expect(resolveMime('noext')).toBe('application/octet-stream');
	});

	it('is case-insensitive for extension matching', () => {
		expect(resolveMime('INVOICE.PDF')).toBe('application/pdf');
		expect(resolveMime('scan.JPG')).toBe('image/jpeg');
	});
});

// ── Session file-membership authorization ────────────────────────────────────
describe('isFileInSession', () => {
	const sessionFiles = ['invoice_abc123.pdf', 'scan_def456.jpg'];

	it('allows a file that belongs to the session', () => {
		expect(isFileInSession(sessionFiles, 'invoice_abc123.pdf')).toBe(true);
	});

	it('rejects a file not in the session', () => {
		expect(isFileInSession(sessionFiles, 'other_file.pdf')).toBe(false);
	});

	it('rejects empty string', () => {
		expect(isFileInSession(sessionFiles, '')).toBe(false);
	});

	it('rejects a file from a different session (same name prefix, different hash)', () => {
		expect(isFileInSession(sessionFiles, 'invoice_xyz999.pdf')).toBe(false);
	});
});

// ── Path-traversal guard ─────────────────────────────────────────────────────
describe('isPathSafe', () => {
	const uploadsDir = path.join(os.tmpdir(), 'mep-test-uploads');

	it('allows a file directly inside the uploads dir', () => {
		const fp = path.join(uploadsDir, 'invoice.pdf');
		expect(isPathSafe(uploadsDir, fp)).toBe(true);
	});

	it('blocks a path that escapes the uploads dir via ../', () => {
		const fp = path.resolve(uploadsDir, '../etc/passwd');
		expect(isPathSafe(uploadsDir, fp)).toBe(false);
	});

	it('blocks a path that starts with the dir name but is a sibling (prefix attack)', () => {
		// e.g. uploadsDir = /tmp/mep-uploads, attack = /tmp/mep-uploads-evil/secret
		const siblingDir = uploadsDir + '-evil';
		const fp = path.join(siblingDir, 'secret.pdf');
		expect(isPathSafe(uploadsDir, fp)).toBe(false);
	});

	it('allows the dir itself (edge case)', () => {
		expect(isPathSafe(uploadsDir, uploadsDir)).toBe(true);
	});
});

// ── Integration: full guard chain with real temp files ───────────────────────
describe('upload guard chain', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mep-upload-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function simulateRequest(
		sessionFiles: string[],
		requestedFile: string
	): { status: number; contentType?: string; contentDisposition?: string; bodyLength?: number } {
		// 1. session membership check
		if (!isFileInSession(sessionFiles, requestedFile)) return { status: 403 };

		// 2. path-traversal guard
		const fp = path.resolve(tmpDir, requestedFile);
		if (!isPathSafe(tmpDir, fp)) return { status: 400 };

		// 3. file existence
		if (!fs.existsSync(fp)) return { status: 404 };

		// 4. serve
		const buf = fs.readFileSync(fp);
		return {
			status: 200,
			contentType: resolveMime(requestedFile),
			contentDisposition: contentDispositionHeader('inline', requestedFile),
			bodyLength: buf.length,
		};
	}

	it('returns 200 with correct MIME and sanitized Content-Disposition for a valid PDF in session', () => {
		const filename = 'factura_año_2024.pdf';
		fs.writeFileSync(path.join(tmpDir, filename), '%PDF-1.4 fake content');
		const result = simulateRequest([filename], filename);
		expect(result.status).toBe(200);
		expect(result.contentType).toBe('application/pdf');
		expect(result.contentDisposition).toBe(
			`inline; filename="factura_a_o_2024.pdf"; filename*=UTF-8''factura_a%C3%B1o_2024.pdf`
		);
		expect(result.bodyLength).toBeGreaterThan(0);
	});

	it('returns 403 when file is not in session', () => {
		const filename = 'invoice_abc.pdf';
		fs.writeFileSync(path.join(tmpDir, filename), 'content');
		const result = simulateRequest(['other_file.pdf'], filename);
		expect(result.status).toBe(403);
	});

	it('returns 404 when file is in session but missing from disk', () => {
		const filename = 'invoice_missing.pdf';
		const result = simulateRequest([filename], filename);
		expect(result.status).toBe(404);
	});

	it('returns 400 for a path-traversal attempt even if listed in session', () => {
		// A malicious session that somehow lists a traversal name
		const traversal = '../secret.pdf';
		const result = simulateRequest([traversal], traversal);
		// path.resolve will produce a path outside tmpDir → isPathSafe returns false
		expect(result.status).toBe(400);
	});

	it('returns 200 with image/jpeg for a JPG', () => {
		const filename = 'scan_001.jpg';
		fs.writeFileSync(path.join(tmpDir, filename), Buffer.from([0xff, 0xd8, 0xff])); // JPEG magic
		const result = simulateRequest([filename], filename);
		expect(result.status).toBe(200);
		expect(result.contentType).toBe('image/jpeg');
	});
});
