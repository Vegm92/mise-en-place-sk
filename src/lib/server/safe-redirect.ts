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
