import { describe, it, expect } from 'vitest';
import yazl from 'yazl';
import { extractZip } from '../src/lib/server/zip-extract';
import { buildZip } from './helpers/zip';
import { MAX_UPLOAD_BYTES, MAX_ZIP_ENTRIES } from '../src/lib/upload-formats';

describe('extractZip — unpacking a ZIP upload (issue #824)', () => {
	it('extracts every entry with its content intact, flattening folder paths to basenames', async () => {
		const buf = await buildZip([
			{ name: 'factura1.pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31] },
			{ name: 'proveedores/2024/enero/factura2.jpg', bytes: [0xff, 0xd8, 0xff, 0xe0] },
		]);

		const result = await extractZip(buf);

		expect(result.errors).toEqual([]);
		expect(result.files.map((f) => f.name).sort()).toEqual(['factura1.pdf', 'factura2.jpg']);
		const f1 = result.files.find((f) => f.name === 'factura1.pdf');
		expect([...f1!.buffer]).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
	});

	it('skips directory entries without producing a file or an error', async () => {
		const zip = new yazl.ZipFile();
		zip.addEmptyDirectory('empty-folder');
		zip.addBuffer(Buffer.from([0x01]), 'factura.pdf');
		zip.end();
		const chunks: Buffer[] = [];
		await new Promise<void>((resolve, reject) => {
			zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
			zip.outputStream.on('end', () => resolve());
			zip.outputStream.on('error', reject);
		});

		const result = await extractZip(Buffer.concat(chunks));

		expect(result.errors).toEqual([]);
		expect(result.files).toHaveLength(1);
		expect(result.files[0].name).toBe('factura.pdf');
	});

	it('rejects a corrupt archive without throwing', async () => {
		const result = await extractZip(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00]));

		expect(result.files).toEqual([]);
		expect(result.errors).toEqual([{ name: '', reason: 'corrupt' }]);
	});

	it('rejects an oversized entry but keeps extracting the rest of the batch', async () => {
		const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
		const buf = await buildZip([
			{ name: 'huge.pdf', bytes: oversized },
			{ name: 'ok.pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
		]);

		const result = await extractZip(buf);

		expect(result.errors).toEqual([{ name: 'huge.pdf', reason: 'tooLarge' }]);
		expect(result.files).toHaveLength(1);
		expect(result.files[0].name).toBe('ok.pdf');
	}, 20_000);

	it('stops unpacking once the entry count exceeds the batch limit', async () => {
		const entries = Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => ({
			name: `factura${i}.pdf`,
			bytes: [0x01],
		}));
		const buf = await buildZip(entries);

		const result = await extractZip(buf);

		expect(result.errors).toContainEqual({ name: '', reason: 'tooManyEntries' });
		expect(result.files.length).toBeLessThanOrEqual(MAX_ZIP_ENTRIES);
	});
});
