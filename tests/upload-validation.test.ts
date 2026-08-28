/**
 * Upload validation — `saveUploadedFiles` (src/lib/server/sessions.ts).
 *
 * Covers the pre-storage guards that protect every upload path (web + batch):
 * allowed extension, 20 MB size cap, and magic-byte sniffing so a file whose
 * bytes don't match its declared extension is rejected (e.g. an executable
 * renamed to `.pdf`). This is the locally-verifiable half of the #200
 * checklist item "STORAGE_DRIVER=railway upload path (magic-byte validation +
 * 20 MB limit)"; the real-bucket round-trip stays a staging-only check.
 *
 * The storage driver is stubbed in-memory so the test runs with no filesystem,
 * DB, or external storage dependency.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, Buffer>() }));

vi.mock('../src/lib/server/storage', () => ({
	getStorage: () => ({
		save: async (key: string, buf: Buffer) => { store.set(key, buf); },
		read: async (key: string) => store.get(key),
		delete: async (key: string) => { store.delete(key); },
	}),
}));

import { saveUploadedFiles } from '../src/lib/server/sessions';

/** Pads well-formed leading bytes past the 1 KB minimum-size floor (#541) with trailing zeros. */
function padToMinSize(bytes: number[], min = 1100): number[] {
	return bytes.length >= min ? bytes : [...bytes, ...new Array(min - bytes.length).fill(0)];
}

// Valid leading bytes for each accepted type.
const MAGIC = {
	pdf: padToMinSize([0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-
	jpg: padToMinSize([0xff, 0xd8, 0xff]),
	png: padToMinSize([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};

function fileWith(name: string, bytes: number[], sizeOverride?: number): File {
	const f = new File([Buffer.from(bytes)], name);
	if (sizeOverride !== undefined) Object.defineProperty(f, 'size', { value: sizeOverride });
	return f;
}

beforeEach(() => store.clear());

describe('saveUploadedFiles — accepts well-formed files', () => {
	it('saves PDF, JPG, and PNG whose content matches their extension', async () => {
		const { saved, keys, errors } = await saveUploadedFiles(
			[
				fileWith('invoice.pdf', MAGIC.pdf),
				fileWith('scan.jpg', MAGIC.jpg),
				fileWith('photo.png', MAGIC.png),
			],
			'ns1',
		);
		expect(errors).toEqual([]);
		expect(saved).toHaveLength(3);
		expect(keys).toEqual(saved.map((n) => `ns1/${n}`));
		expect(store.size).toBe(3);
		// original stem preserved, uniqueness suffix + extension appended
		expect(saved[0]).toMatch(/^invoice_[0-9a-f]{6}\.pdf$/);
	});

	it('gives each file a distinct key even when names collide', async () => {
		const { saved, keys } = await saveUploadedFiles(
			[fileWith('dup.pdf', MAGIC.pdf), fileWith('dup.pdf', MAGIC.pdf)],
			'ns2',
		);
		expect(saved).toHaveLength(2);
		expect(keys[0]).not.toBe(keys[1]);
		expect(new Set(store.keys()).size).toBe(2);
	});
});

describe('saveUploadedFiles — rejects invalid files', () => {
	it('rejects an unsupported extension without touching storage', async () => {
		const { saved, errors } = await saveUploadedFiles([fileWith('note.txt', MAGIC.pdf)], 'ns');
		expect(saved).toEqual([]);
		expect(errors[0]).toEqual({ name: 'note.txt', reason: 'unsupportedType', ext: '.txt' });
		expect(store.size).toBe(0);
	});

	it('rejects a file over the 20 MB limit', async () => {
		const big = fileWith('huge.pdf', MAGIC.pdf, 20 * 1024 * 1024 + 1);
		const { saved, errors } = await saveUploadedFiles([big], 'ns');
		expect(saved).toEqual([]);
		expect(errors[0]).toEqual({ name: 'huge.pdf', reason: 'tooLarge' });
		expect(store.size).toBe(0);
	});

	it('rejects a file whose magic bytes do not match its extension (spoofed type)', async () => {
		// JPEG bytes wearing a .pdf extension — the core anti-spoofing guard.
		const { saved, errors } = await saveUploadedFiles([fileWith('malware.pdf', MAGIC.jpg)], 'ns');
		expect(saved).toEqual([]);
		expect(errors[0]).toEqual({ name: 'malware.pdf', reason: 'contentMismatch' });
		expect(store.size).toBe(0);
	});

	it('saves the good files and reports errors for the bad ones in a mixed batch', async () => {
		const { saved, errors } = await saveUploadedFiles(
			[
				fileWith('good.pdf', MAGIC.pdf),
				fileWith('spoof.png', MAGIC.jpg), // wrong magic
				fileWith('good.jpg', MAGIC.jpg),
			],
			'mix',
		);
		expect(saved).toHaveLength(2);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ name: 'spoof.png', reason: 'contentMismatch' });
		expect(store.size).toBe(2);
	});
});
