export const SUPPORTED_UPLOAD_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xml'] as const;

export type SupportedUploadExtension = (typeof SUPPORTED_UPLOAD_EXTENSIONS)[number];

export const UPLOAD_ACCEPT = SUPPORTED_UPLOAD_EXTENSIONS.join(',');

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function isSupportedUploadExtension(ext: string): ext is SupportedUploadExtension {
	return (SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}
