import {
	MAGIC_BYTES,
	MAX_UPLOAD_BYTES,
	MIN_UPLOAD_BYTES,
	SUPPORTED_UPLOAD_EXTENSIONS,
	type RejectReason,
} from '$lib/upload-formats';

export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set(SUPPORTED_UPLOAD_EXTENSIONS);
export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;
export const MIN_FILE_BYTES = MIN_UPLOAD_BYTES;

export { MAGIC_BYTES };
export type { RejectReason };

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
	if (buf.length < MIN_FILE_BYTES) return 'tooSmall';
	const magicCheck = MAGIC_BYTES[ext];
	if (magicCheck && !magicCheck(buf)) return 'contentMismatch';
	return null;
}
