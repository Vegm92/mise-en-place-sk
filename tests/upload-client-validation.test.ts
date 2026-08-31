/**
 * Client-side upload validation (issue #541).
 *
 * Selecting an unsupported/oversized/undersized/spoofed file used to enqueue
 * it (or, for HEIC, was caught) with nothing else checked client-side — the
 * server was the only gate, so a bad file made a full round trip before the
 * user learned anything, and a tiny fake-header stub reached extraction
 * before failing. `validateUploadFile` runs the same checks the server runs
 * — extension, size floor/ceiling, magic bytes — before a file is queued,
 * reusing the exact `MAGIC_BYTES` table `sessions.ts` sniffs with, so the
 * two layers can never drift (the #520 parity theme).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { locale, t } from '../src/lib/i18n';
import {
	SUPPORTED_UPLOAD_EXTENSIONS,
	MAX_UPLOAD_BYTES,
	MAX_ZIP_BYTES,
	MIN_UPLOAD_BYTES,
	MAGIC_BYTES,
	isSupportedUploadExtension,
	isHeicUpload,
	uploadExtname,
	checkUploadSize,
	checkMagicBytes,
	readUploadHeader,
	validateUploadFile,
	type RejectReason,
} from '../src/lib/upload-formats';
import { MAGIC_BYTES as SERVER_MAGIC_BYTES } from '../src/lib/server/sessions';

/** Well-formed leading bytes for each supported type, padded past MIN_UPLOAD_BYTES. */
function padToMinSize(bytes: number[], min = MIN_UPLOAD_BYTES + 100): number[] {
	return bytes.length >= min ? bytes : [...bytes, ...new Array(min - bytes.length).fill(0)];
}

const SAMPLE: Record<string, number[]> = {
	'.pdf':  padToMinSize([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
	'.jpg':  padToMinSize([0xff, 0xd8, 0xff, 0xe0]),
	'.jpeg': padToMinSize([0xff, 0xd8, 0xff, 0xe0]),
	'.png':  padToMinSize([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	'.xml':  padToMinSize([...Buffer.from('<?xml version="1.0"?><Facturae/>')]),
	'.zip':  padToMinSize([0x50, 0x4b, 0x03, 0x04]),
};

function fileWith(name: string, bytes: number[]): File {
	return new File([Buffer.from(bytes)], name);
}

describe('the client sniffs with the exact table the server sniffs with (#520 parity)', () => {
	it('is the same object, not a copy — the two layers cannot drift', () => {
		expect(SERVER_MAGIC_BYTES).toBe(MAGIC_BYTES);
	});

	it.each(SUPPORTED_UPLOAD_EXTENSIONS)('has a magic-byte check for %s', (ext) => {
		expect(MAGIC_BYTES[ext]).toBeTypeOf('function');
	});
});

describe('checkUploadSize', () => {
	it('accepts a size strictly between the floor and the ceiling', () => {
		expect(checkUploadSize(MIN_UPLOAD_BYTES + 1)).toBeNull();
		expect(checkUploadSize(MAX_UPLOAD_BYTES - 1)).toBeNull();
	});

	it('accepts exactly the floor and exactly the ceiling', () => {
		expect(checkUploadSize(MIN_UPLOAD_BYTES)).toBeNull();
		expect(checkUploadSize(MAX_UPLOAD_BYTES)).toBeNull();
	});

	it('rejects one byte under the floor as tooSmall', () => {
		expect(checkUploadSize(MIN_UPLOAD_BYTES - 1)).toBe('tooSmall');
	});

	it('rejects a zero-byte file as tooSmall', () => {
		expect(checkUploadSize(0)).toBe('tooSmall');
	});

	it('rejects one byte over the ceiling as tooLarge', () => {
		expect(checkUploadSize(MAX_UPLOAD_BYTES + 1)).toBe('tooLarge');
	});
});

describe('checkUploadSize — a .zip container uses the larger batch ceiling (issue #824)', () => {
	it('accepts a zip well over the normal 20 MB single-file cap', () => {
		expect(checkUploadSize(MAX_UPLOAD_BYTES + 1, '.zip')).toBeNull();
	});

	it('rejects a zip over the zip-specific ceiling', () => {
		expect(checkUploadSize(MAX_ZIP_BYTES + 1, '.zip')).toBe('tooLarge');
	});

	it('has no minimum-size floor for a zip container — a well-compressed archive can be tiny', () => {
		expect(checkUploadSize(1, '.zip')).toBeNull();
	});

	it('still enforces the floor for every non-zip type', () => {
		expect(checkUploadSize(MIN_UPLOAD_BYTES - 1, '.pdf')).toBe('tooSmall');
	});
});

describe('checkMagicBytes', () => {
	it.each(SUPPORTED_UPLOAD_EXTENSIONS)('accepts a well-formed %s header', (ext) => {
		expect(checkMagicBytes(new Uint8Array(SAMPLE[ext]), ext)).toBe(true);
	});

	it('rejects JPEG bytes wearing a .pdf extension', () => {
		expect(checkMagicBytes(new Uint8Array(SAMPLE['.jpg']), '.pdf')).toBe(false);
	});

	it('rejects a PNG header wearing a .jpg extension', () => {
		expect(checkMagicBytes(new Uint8Array(SAMPLE['.png']), '.jpg')).toBe(false);
	});

	it('rejects plain text wearing an .xml extension', () => {
		expect(checkMagicBytes(new TextEncoder().encode('not xml at all'), '.xml')).toBe(false);
	});

	it('passes through an extension with no registered signature', () => {
		expect(checkMagicBytes(new Uint8Array([0x00]), '.unknown')).toBe(true);
	});
});

describe('readUploadHeader', () => {
	it('reads only the leading slice, not the whole file', async () => {
		const file = fileWith('big.pdf', SAMPLE['.pdf']);
		const header = await readUploadHeader(file, 8);
		expect(header).toHaveLength(8);
		expect([...header.slice(0, 5)]).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
	});
});

describe('validateUploadFile — the single client-side gate before a file is queued', () => {
	it.each(SUPPORTED_UPLOAD_EXTENSIONS)('passes a well-formed %s file', async (ext) => {
		const reason = await validateUploadFile(fileWith(`factura${ext}`, SAMPLE[ext]));
		expect(reason).toBeNull();
	});

	it('flags an unsupported extension without reading the file contents', async () => {
		const file = fileWith('note.txt', [0x00]);
		const reason = await validateUploadFile(file);
		expect(reason).toBe('unsupportedType');
	});

	it('flags a file under the 1 KB floor even with a well-formed header', async () => {
		const file = fileWith('stub.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
		expect(file.size).toBeLessThan(MIN_UPLOAD_BYTES);
		const reason = await validateUploadFile(file);
		expect(reason).toBe('tooSmall');
	});

	it('flags an oversized file before reading its magic bytes', async () => {
		const file = fileWith('grande.pdf', SAMPLE['.pdf']);
		Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 });
		const reason = await validateUploadFile(file);
		expect(reason).toBe('tooLarge');
	});

	it('flags content that does not match its extension (spoofed type)', async () => {
		const file = fileWith('malware.pdf', SAMPLE['.jpg']);
		const reason = await validateUploadFile(file);
		expect(reason).toBe('contentMismatch');
	});
});

describe('uploadExtname / isSupportedUploadExtension', () => {
	it('extracts a lowercased, dotted extension', () => {
		expect(uploadExtname('INVOICE.PDF')).toBe('.pdf');
		expect(uploadExtname('scan.JPEG')).toBe('.jpeg');
	});

	it('returns empty for a file with no extension or a dotfile', () => {
		expect(uploadExtname('noext')).toBe('');
		expect(uploadExtname('.gitignore')).toBe('');
	});

	it.each(SUPPORTED_UPLOAD_EXTENSIONS)('%s is supported', (ext) => {
		expect(isSupportedUploadExtension(ext)).toBe(true);
	});

	it.each(['.txt', '.heic', '.gif', '.docx', '.exe'])('%s is not supported', (ext) => {
		expect(isSupportedUploadExtension(ext)).toBe(false);
	});
});

/**
 * The rejection message shown to the user picks between two i18n keys: a
 * HEIC-specific one (issue #484) checked first, and the generic
 * `upload.reject.${reason}` template for everything else `validateUploadFile`
 * can return. Never drop a file without naming one of the two (issue #541).
 */
describe('unsupported-file message-key selection (mirrors UploadPanel.svelte#addFiles)', () => {
	function rejectionKey(file: { name: string; type: string }, reason: RejectReason | null): string | null {
		if (isHeicUpload(file)) return 'upload.reject.heic';
		if (reason) return `upload.reject.${reason}`;
		return null;
	}

	const REJECT_REASONS: RejectReason[] = ['unsupportedType', 'tooLarge', 'tooSmall', 'contentMismatch'];

	it('picks the HEIC key even when the extension would otherwise resolve a reason', () => {
		expect(rejectionKey({ name: 'photo.heic', type: '' }, 'unsupportedType')).toBe('upload.reject.heic');
	});

	it('picks the generic reject key for every other reason', () => {
		for (const reason of REJECT_REASONS) {
			expect(rejectionKey({ name: 'invoice.pdf', type: 'application/pdf' }, reason))
				.toBe(`upload.reject.${reason}`);
		}
	});

	it('never returns null for an accepted file that also came back with a reason', () => {
		for (const reason of REJECT_REASONS) {
			expect(rejectionKey({ name: 'x', type: '' }, reason)).not.toBeNull();
		}
	});

	it('resolves the HEIC key and every reason key in both locales', () => {
		const keys = ['upload.reject.heic', ...REJECT_REASONS.map((r) => `upload.reject.${r}`)];
		const missing: string[] = [];
		for (const lc of ['es', 'en'] as const) {
			locale.set(lc);
			for (const key of keys) {
				if (get(t)(key) === key) missing.push(`${lc}:${key}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('the component checks HEIC before validating the rest (source order, not just logic parity)', () => {
		const source = readFileSync(
			new URL('../src/lib/components/UploadPanel.svelte', import.meta.url),
			'utf-8',
		);
		const heicIdx = source.indexOf('isHeicUpload(f)');
		const validateIdx = source.indexOf('validateUploadFile(f)');
		expect(heicIdx, 'UploadPanel no longer special-cases HEIC before the shared validator').toBeGreaterThan(-1);
		expect(validateIdx, 'UploadPanel no longer calls the shared client-side validator').toBeGreaterThan(-1);
		expect(heicIdx).toBeLessThan(validateIdx);
	});
});
