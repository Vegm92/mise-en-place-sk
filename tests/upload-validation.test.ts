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
import { buildZip } from './helpers/zip';
import { MAX_ZIP_BYTES } from '../src/lib/upload-formats';

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

/**
 * ZIP upload support (issue #824): a .zip is not stored as-is, it is unpacked
 * server-side and every extracted entry runs through the same saveEntry gate
 * as a directly uploaded file, so a bad entry is reported without blocking
 * the rest of the batch — same "mixed batch" behavior as above.
 */
function zipFile(name: string, buf: Buffer): File {
	return new File([new Uint8Array(buf)], name);
}

describe('saveUploadedFiles — unpacking a well-formed .zip', () => {
	it('saves every well-formed entry inside, flattening any folder structure to basenames', async () => {
		const buf = await buildZip([
			{ name: 'factura1.pdf', bytes: MAGIC.pdf },
			{ name: 'proveedores/enero/factura2.jpg', bytes: MAGIC.jpg },
		]);

		const { saved, keys, errors } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(errors).toEqual([]);
		expect(saved).toHaveLength(2);
		expect(keys).toEqual(saved.map((n) => `ns/${n}`));
		expect(store.size).toBe(2);
		expect(saved.some((n) => /^factura2_[0-9a-f]{6}\.jpg$/.test(n))).toBe(true);
	});

	it('does not store the zip container itself, only its entries', async () => {
		const buf = await buildZip([{ name: 'factura.pdf', bytes: MAGIC.pdf }]);

		const { saved } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(saved.every((n) => !n.endsWith('.zip'))).toBe(true);
	});
});

describe.each([
	['an unsupported entry type', 'readme.txt', [0x00], { reason: 'unsupportedType', ext: '.txt' }],
	['a spoofed entry (wrong content for its extension)', 'spoof.pdf', MAGIC.jpg, { reason: 'contentMismatch' }],
	['an entry under the minimum size floor', 'stub.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d], { reason: 'tooSmall' }],
] as const)('saveUploadedFiles — %s does not block the rest of the zip batch', (_label, badName, badBytes, expected) => {
	it(`reports it and still saves the good entries`, async () => {
		const buf = await buildZip([
			{ name: 'good.pdf', bytes: MAGIC.pdf },
			{ name: badName, bytes: [...badBytes] },
		]);

		const { saved, errors } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(saved).toHaveLength(1);
		expect(errors).toEqual([{ name: `lote.zip/${badName}`, ...expected }]);
	});
});

describe('saveUploadedFiles — a bad zip container is rejected, direct files still work', () => {
	it('rejects a corrupt archive as a single error, not a crash', async () => {
		const bad = zipFile('roto.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]));

		const { saved, errors } = await saveUploadedFiles([bad], 'ns');

		expect(saved).toEqual([]);
		expect(errors).toEqual([{ name: 'roto.zip', reason: 'corrupt' }]);
	});

	it('rejects a file wearing a .zip extension whose content is not a real zip (spoofed)', async () => {
		const fake = zipFile('fake.zip', Buffer.from(MAGIC.pdf));

		const { saved, errors } = await saveUploadedFiles([fake], 'ns');

		expect(saved).toEqual([]);
		expect(errors).toEqual([{ name: 'fake.zip', reason: 'contentMismatch' }]);
	});

	it('rejects a zip over the container size cap without attempting to parse it', async () => {
		const big = zipFile('grande.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04]));
		Object.defineProperty(big, 'size', { value: MAX_ZIP_BYTES + 1 });

		const { saved, errors } = await saveUploadedFiles([big], 'ns');

		expect(saved).toEqual([]);
		expect(errors).toEqual([{ name: 'grande.zip', reason: 'tooLarge' }]);
	});

	it('processes a zip alongside a directly uploaded file in the same batch', async () => {
		const buf = await buildZip([{ name: 'inzip.pdf', bytes: MAGIC.pdf }]);
		const direct = zipFile('directo.jpg', Buffer.from(MAGIC.jpg));

		const { saved, errors } = await saveUploadedFiles([zipFile('lote.zip', buf), direct], 'ns');

		expect(errors).toEqual([]);
		expect(saved).toHaveLength(2);
	});
});
