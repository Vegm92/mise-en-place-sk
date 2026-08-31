/**
 * The four supported-file-type lists are one list (issue #520).
 *
 * A file type has to clear four independent gates to work, and each gate had
 * its own hardcoded copy of the answer:
 *
 *   1. the `accept` attribute on every file input — what the picker offers;
 *   2. `ALLOWED_EXTENSIONS` in sessions.ts — what the upload guard admits;
 *   3. `MAGIC_BYTES` in sessions.ts — what it can sniff to prove the bytes
 *      match the extension;
 *   4. `classifyFile` in extract.ts — what extraction can actually read.
 *
 * They disagreed. `.heic` was offered by two of the three pickers and rejected
 * by gate 2, so an iPhone user picked a photo the server refused with
 * "unsupported type". Nothing failed loudly; the drift was only visible by
 * reading all four lists side by side.
 *
 * These tests make the lists derive from `src/lib/upload-formats.ts` and then
 * prove agreement end to end: whatever the picker offers, the guard saves and
 * extraction can classify.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildZip } from './helpers/zip';

const { store } = vi.hoisted(() => ({ store: new Map<string, Buffer>() }));

vi.mock('../src/lib/server/storage', () => ({
	getStorage: () => ({
		save: async (key: string, buf: Buffer) => { store.set(key, buf); },
		read: async (key: string) => store.get(key),
		delete: async (key: string) => { store.delete(key); },
	}),
}));

import {
	SUPPORTED_UPLOAD_EXTENSIONS,
	UPLOAD_ACCEPT,
	ZIP_UPLOAD_ACCEPT,
	ZIP_UPLOAD_EXTENSION,
	ZIP_MIME_TYPES,
	MAX_UPLOAD_BYTES,
	isSupportedUploadExtension,
	isHeicUpload,
} from '../src/lib/upload-formats';
import { ALLOWED_EXTENSIONS, MAGIC_BYTES, saveUploadedFiles } from '../src/lib/server/sessions';
import { classifyFile } from '../src/lib/server/extract';

const ROOT = process.cwd();

/** Pads well-formed leading bytes past the 1 KB minimum-size floor (#541) with trailing zeros. */
function padToMinSize(bytes: number[], min = 1100): number[] {
	return bytes.length >= min ? bytes : [...bytes, ...new Array(min - bytes.length).fill(0)];
}

/** Well-formed leading bytes for each supported type. */
const SAMPLE: Record<string, number[]> = {
	'.pdf':  padToMinSize([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
	'.jpg':  padToMinSize([0xff, 0xd8, 0xff, 0xe0]),
	'.jpeg': padToMinSize([0xff, 0xd8, 0xff, 0xe0]),
	'.png':  padToMinSize([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	'.xml':  padToMinSize([...Buffer.from('<?xml version="1.0"?><Facturae/>')]),
};

/**
 * .zip is a container, not a document — its sample is a real archive with
 * one well-formed .pdf entry inside, built lazily in beforeAll below since
 * zip encoding is async.
 */
beforeAll(async () => {
	const zip = await buildZip([{ name: 'factura.pdf', bytes: SAMPLE['.pdf'] }]);
	SAMPLE['.zip'] = [...zip];
});

/** Types a picker must not offer, each rejected by at least one gate today. */
const UNSUPPORTED = ['.heic', '.xlsx', '.docx', '.gif', '.webp'];

/**
 * .zip is admitted by the guard (which unpacks it) but is never itself
 * handed to extraction — saveUploadedFiles always expands it into its
 * constituent entries first, so classifyFile only ever sees the extracted
 * documents, never the raw archive.
 */
const CLASSIFIABLE_EXTENSIONS = SUPPORTED_UPLOAD_EXTENSIONS.filter((ext) => ext !== '.zip');

function walkSvelte(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walkSvelte(full, out);
		else if (entry.name.endsWith('.svelte')) out.push(full);
	}
	return out;
}

const SVELTE_FILES = walkSvelte(path.join(ROOT, 'src'));

beforeEach(() => store.clear());

describe('every file picker offers exactly the supported list', () => {
	const acceptAttrs = SVELTE_FILES.flatMap((file) =>
		[...fs.readFileSync(file, 'utf8').matchAll(/accept=(?:"([^"]*)"|\{([^}]*)\})/g)].map((m) => ({
			file: path.relative(ROOT, file),
			literal: m[1],
			expression: m[2]?.trim(),
		}))
	);

	it('finds the file inputs to check', () => {
		expect(acceptAttrs.length).toBeGreaterThan(0);
	});

	it('has no picker spelling out its own extension list', () => {
		const hardcoded = acceptAttrs
			.filter((a) => a.literal?.includes('.'))
			.map((a) => `${a.file} → accept="${a.literal}"`);

		expect(hardcoded, 'extension lists must come from UPLOAD_ACCEPT, not a literal').toEqual([]);
	});

	it.each(acceptAttrs.filter((a) => a.expression).map((a) => `${a.file}:${a.expression}`))(
		'%s reads a shared constant',
		(entry) => {
			expect(['UPLOAD_ACCEPT', 'ZIP_UPLOAD_ACCEPT']).toContain(entry.split(':').at(-1));
		}
	);

	it('the single-type zip picker offers a type the guard already admits', () => {
		expect(SUPPORTED_UPLOAD_EXTENSIONS).toContain(ZIP_UPLOAD_EXTENSION);
		expect(ZIP_UPLOAD_ACCEPT.split(',')).toEqual([ZIP_UPLOAD_EXTENSION, ...ZIP_MIME_TYPES]);
	});

	it('builds the accept attribute from the supported extensions', () => {
		expect(UPLOAD_ACCEPT.split(',')).toEqual([...SUPPORTED_UPLOAD_EXTENSIONS]);
	});
});

describe('the upload guard admits exactly the supported list', () => {
	it('shares one set with the client', () => {
		expect([...ALLOWED_EXTENSIONS].sort()).toEqual([...SUPPORTED_UPLOAD_EXTENSIONS].sort());
	});

	it.each(SUPPORTED_UPLOAD_EXTENSIONS)('%s has a magic-byte check', (ext) => {
		expect(MAGIC_BYTES[ext], `no magic-byte sniffing for ${ext} — a spoofed file would pass`)
			.toBeTypeOf('function');
	});

	it('sniffs nothing it does not admit', () => {
		const orphans = Object.keys(MAGIC_BYTES).filter((ext) => !isSupportedUploadExtension(ext));
		expect(orphans).toEqual([]);
	});

	it.each(SUPPORTED_UPLOAD_EXTENSIONS)('accepts a well-formed %s file', async (ext) => {
		const result = await saveUploadedFiles(
			[new File([Buffer.from(SAMPLE[ext])], `factura${ext}`)],
			'ns'
		);

		expect(result.errors, `a well-formed ${ext} was rejected`).toEqual([]);
		expect(result.keys).toHaveLength(1);
	});

	it.each(UNSUPPORTED)('rejects %s, which no picker offers', async (ext) => {
		const result = await saveUploadedFiles([new File([Buffer.from('x')], `factura${ext}`)], 'ns');

		expect(result.errors).toEqual([{ name: `factura${ext}`, reason: 'unsupportedType', ext }]);
		expect(store.size).toBe(0);
	});

	it('agrees with the shared size cap', async () => {
		const big = new File([Buffer.from(SAMPLE['.pdf'])], 'grande.pdf');
		Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });

		const result = await saveUploadedFiles([big], 'ns');
		expect(result.errors).toEqual([{ name: 'grande.pdf', reason: 'tooLarge' }]);
	});
});

/**
 * Issue #484: .heic was offered by the picker but rejected by the server,
 * so an iPhone user's photo went all the way up before failing. It is now
 * dropped from the accept list above (covered by the tests already in this
 * file) and, additionally, caught client-side before the transfer starts.
 */
describe('the client refuses a HEIC pick before it ever reaches the guard', () => {
	it.each([
		['iphone.heic', ''],
		['IPHONE.HEIC', ''],
		['iphone.heif', ''],
		['photo.jpg', 'image/heic'],
		['photo', 'image/heif'],
	])('flags %s (type=%s) as HEIC', (name, type) => {
		expect(isHeicUpload({ name, type })).toBe(true);
	});

	it.each([
		['factura.jpg', 'image/jpeg'],
		['factura.png', 'image/png'],
		['factura.pdf', 'application/pdf'],
		['factura.xml', 'application/xml'],
	])('does not flag %s (type=%s)', (name, type) => {
		expect(isHeicUpload({ name, type })).toBe(false);
	});
});

describe('extraction can read everything the guard admits', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mep-filetypes-'));

	const write = (name: string, bytes: number[]) => {
		const fp = path.join(dir, name);
		fs.writeFileSync(fp, Buffer.from(bytes));
		return fp;
	};

	it.each(CLASSIFIABLE_EXTENSIONS)('classifyFile handles %s', async (ext) => {
		const classified = await classifyFile(write(`factura${ext}`, SAMPLE[ext]));

		expect(classified.type).toBeTruthy();
	});

	it.each(UNSUPPORTED)('classifyFile refuses %s', (ext) => {
		expect(() => classifyFile(write(`factura${ext}`, [0x00])))
			.toThrow(`Unsupported file type: ${ext}`);
	});

	it('classifyFile never sees a raw .zip — saveUploadedFiles always expands it first', () => {
		expect(() => classifyFile(write('factura.zip', [0x50, 0x4b, 0x03, 0x04])))
			.toThrow('Unsupported file type: .zip');
	});
});
