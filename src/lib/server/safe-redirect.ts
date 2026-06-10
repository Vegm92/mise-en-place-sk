/**
 * Validates a redirect target is a same-origin relative path.
 * Rejects absolute URLs, protocol-relative URLs (//), and backslash variants.
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
	if (
		target &&
		target.startsWith('/') &&
		!target.startsWith('//') &&
		!target.startsWith('/\\')
	) {
		return target;
	}
	return fallback;
}
