/**
 * saveUploadedFiles — ZIP upload support (issue #824).
 *
 * A .zip is not stored as-is: it is unpacked server-side and every extracted
 * entry runs through the same extension/size/magic-byte gate as a directly
 * uploaded file (sessions.ts#saveEntry). A bad entry (unsupported type,
 * spoofed content, oversized) is reported without blocking the rest of the
 * batch, matching how a mixed multi-select upload already behaves.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildZip } from './helpers/zip';
import { MAX_ZIP_BYTES, MIN_UPLOAD_BYTES } from '../src/lib/upload-formats';

const { store } = vi.hoisted(() => ({ store: new Map<string, Buffer>() }));

vi.mock('../src/lib/server/storage', () => ({
	getStorage: () => ({
		save: async (key: string, buf: Buffer) => { store.set(key, buf); },
		read: async (key: string) => store.get(key),
		delete: async (key: string) => { store.delete(key); },
	}),
}));

import { saveUploadedFiles } from '../src/lib/server/sessions';

function padToMinSize(bytes: number[], min = MIN_UPLOAD_BYTES + 100): number[] {
	return bytes.length >= min ? bytes : [...bytes, ...new Array(min - bytes.length).fill(0)];
}

const PDF = padToMinSize([0x25, 0x50, 0x44, 0x46, 0x2d]);
const JPG = padToMinSize([0xff, 0xd8, 0xff]);

function zipFile(name: string, buf: Buffer): File {
	return new File([new Uint8Array(buf)], name);
}

beforeEach(() => store.clear());

describe('saveUploadedFiles — unpacking a well-formed .zip', () => {
	it('saves every well-formed entry inside', async () => {
		const buf = await buildZip([
			{ name: 'factura1.pdf', bytes: PDF },
			{ name: 'factura2.jpg', bytes: JPG },
		]);

		const { saved, keys, errors } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(errors).toEqual([]);
		expect(saved).toHaveLength(2);
		expect(keys).toEqual(saved.map((n) => `ns/${n}`));
		expect(store.size).toBe(2);
	});

	it('flattens a nested folder structure inside the zip to basenames', async () => {
		const buf = await buildZip([
			{ name: 'proveedores/enero/factura.pdf', bytes: PDF },
		]);

		const { saved, errors } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(errors).toEqual([]);
		expect(saved[0]).toMatch(/^factura_[0-9a-f]{6}\.pdf$/);
	});

	it('does not store the zip container itself, only its entries', async () => {
		const buf = await buildZip([{ name: 'factura.pdf', bytes: PDF }]);

		const { saved } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(saved.every((n) => !n.endsWith('.zip'))).toBe(true);
	});
});

describe('saveUploadedFiles — a bad entry does not block the rest of the zip batch', () => {
	it('reports an unsupported entry type but still saves the good entries', async () => {
		const buf = await buildZip([
			{ name: 'factura.pdf', bytes: PDF },
			{ name: 'readme.txt', bytes: [0x00] },
		]);

		const { saved, errors } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(saved).toHaveLength(1);
		expect(errors).toEqual([{ name: 'lote.zip/readme.txt', reason: 'unsupportedType', ext: '.txt' }]);
	});

	it('reports a spoofed entry (content does not match extension) without blocking the batch', async () => {
		const buf = await buildZip([
			{ name: 'good.pdf', bytes: PDF },
			{ name: 'spoof.pdf', bytes: JPG },
		]);

		const { saved, errors } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(saved).toHaveLength(1);
		expect(errors).toEqual([{ name: 'lote.zip/spoof.pdf', reason: 'contentMismatch' }]);
	});

	it('reports an entry under the minimum size floor without blocking the batch', async () => {
		const buf = await buildZip([
			{ name: 'good.pdf', bytes: PDF },
			{ name: 'stub.pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
		]);

		const { saved, errors } = await saveUploadedFiles([zipFile('lote.zip', buf)], 'ns');

		expect(saved).toHaveLength(1);
		expect(errors).toEqual([{ name: 'lote.zip/stub.pdf', reason: 'tooSmall' }]);
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
		const fake = zipFile('fake.zip', Buffer.from(PDF));

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
		const buf = await buildZip([{ name: 'inzip.pdf', bytes: PDF }]);
		const direct = zipFile('directo.jpg', Buffer.from(JPG));

		const { saved, errors } = await saveUploadedFiles([zipFile('lote.zip', buf), direct], 'ns');

		expect(errors).toEqual([]);
		expect(saved).toHaveLength(2);
	});
});
