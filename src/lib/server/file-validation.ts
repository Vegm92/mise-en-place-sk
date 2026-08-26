import { MAX_UPLOAD_BYTES, SUPPORTED_UPLOAD_EXTENSIONS } from '$lib/upload-formats';

export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set(SUPPORTED_UPLOAD_EXTENSIONS);
export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;

const UTF8_BOM = [0xEF, 0xBB, 0xBF];
const XML_LESS_THAN = 0x3C;

function looksLikeXml(b: Buffer): boolean {
	let start = (b[0] === UTF8_BOM[0] && b[1] === UTF8_BOM[1] && b[2] === UTF8_BOM[2]) ? 3 : 0;
	while (start < b.length && (b[start] === 0x20 || b[start] === 0x09 || b[start] === 0x0A || b[start] === 0x0D)) start++;
	return b[start] === XML_LESS_THAN;
}

export const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
	'.pdf':  (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D,
	'.jpg':  (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
	'.jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
	'.png':  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A,
	'.xml':  looksLikeXml,
};

export type RejectReason = 'unsupportedType' | 'tooLarge' | 'contentMismatch';

export class MediaTooLargeError extends Error {
	readonly declaredSize: number;

	constructor(declaredSize: number) {
		super(`media is ${declaredSize} bytes, over the ${MAX_FILE_BYTES} byte limit`);
		this.name = 'MediaTooLargeError';
		this.declaredSize = declaredSize;
	}
}

export function validateBuffer(buf: Buffer, ext: string): RejectReason | null {
	if (!ALLOWED_EXTENSIONS.has(ext)) return 'unsupportedType';
	if (buf.length > MAX_FILE_BYTES) return 'tooLarge';
	const magicCheck = MAGIC_BYTES[ext];
	if (magicCheck && !magicCheck(buf)) return 'contentMismatch';
	return null;
}
