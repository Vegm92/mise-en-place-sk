export const SUPPORTED_UPLOAD_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xml', '.zip'] as const;

export type SupportedUploadExtension = (typeof SUPPORTED_UPLOAD_EXTENSIONS)[number];

export const UPLOAD_ACCEPT = SUPPORTED_UPLOAD_EXTENSIONS.join(',');

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const MIN_UPLOAD_BYTES = 1024;

export const MAX_UPLOAD_TOTAL_BYTES = 100 * 1024 * 1024;

export const MAX_ZIP_BYTES = MAX_UPLOAD_TOTAL_BYTES;

export const MAX_ZIP_ENTRIES = 50;

export function isSupportedUploadExtension(ext: string): ext is SupportedUploadExtension {
	return (SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

const HEIC_EXTENSIONS = new Set(['heic', 'heif']);
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);

export function isHeicUpload(file: { name: string; type: string }): boolean {
	const ext = file.name.split('.').pop()?.toLowerCase();
	return (ext !== undefined && HEIC_EXTENSIONS.has(ext)) || HEIC_MIME_TYPES.has(file.type);
}

export function uploadExtname(name: string): string {
	const i = name.lastIndexOf('.');
	return i <= 0 ? '' : name.slice(i).toLowerCase();
}

const UTF8_BOM = [0xEF, 0xBB, 0xBF];
const XML_LESS_THAN = 0x3C;

function looksLikeXml(b: Uint8Array): boolean {
	let start = (b[0] === UTF8_BOM[0] && b[1] === UTF8_BOM[1] && b[2] === UTF8_BOM[2]) ? 3 : 0;
	while (start < b.length && (b[start] === 0x20 || b[start] === 0x09 || b[start] === 0x0A || b[start] === 0x0D)) start++;
	return b[start] === XML_LESS_THAN;
}

export const MAGIC_BYTES: Record<string, (buf: Uint8Array) => boolean> = {
	'.pdf':  (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D,
	'.jpg':  (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
	'.jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
	'.png':  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A,
	'.xml':  looksLikeXml,
	'.zip':  (b) => b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04,
};

export type RejectReason =
	| 'unsupportedType'
	| 'tooLarge'
	| 'tooSmall'
	| 'contentMismatch'
	| 'corrupt'
	| 'tooManyEntries';

export function totalUploadBytes(files: readonly { size: number }[]): number {
	return files.reduce((sum, f) => sum + f.size, 0);
}

export function exceedsUploadTotal(files: readonly { size: number }[]): boolean {
	return totalUploadBytes(files) > MAX_UPLOAD_TOTAL_BYTES;
}

export function checkUploadSize(size: number, ext?: string): 'tooLarge' | 'tooSmall' | null {
	const isZip = ext?.toLowerCase() === '.zip';
	const max = isZip ? MAX_ZIP_BYTES : MAX_UPLOAD_BYTES;
	if (size > max) return 'tooLarge';
	if (!isZip && size < MIN_UPLOAD_BYTES) return 'tooSmall';
	return null;
}

export function checkMagicBytes(bytes: Uint8Array, ext: string): boolean {
	const check = MAGIC_BYTES[ext.toLowerCase()];
	return !check || check(bytes);
}

const MAGIC_HEADER_BYTES = 64;

export async function readUploadHeader(file: Blob, length = MAGIC_HEADER_BYTES): Promise<Uint8Array> {
	const buf = await file.slice(0, length).arrayBuffer();
	return new Uint8Array(buf);
}

export async function validateUploadFile(file: File): Promise<RejectReason | null> {
	const ext = uploadExtname(file.name);
	if (!isSupportedUploadExtension(ext)) return 'unsupportedType';
	const sizeReason = checkUploadSize(file.size, ext);
	if (sizeReason) return sizeReason;
	const header = await readUploadHeader(file);
	return checkMagicBytes(header, ext) ? null : 'contentMismatch';
}
