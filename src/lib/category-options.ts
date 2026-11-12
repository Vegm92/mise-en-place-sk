export function categoryOptions(categories: readonly string[], current: string | null | undefined): string[] {
	return current && !categories.includes(current) ? [...categories, current] : [...categories];
}

export function resolveSubmittedCategory(
	submitted: string | null | undefined,
	selectable: readonly string[],
	current: string | null | undefined,
): string | null {
	if (!submitted) return null;
	if (selectable.includes(submitted)) return submitted;
	return submitted === current ? submitted : null;
}
