import { VALID_CATEGORIES, categorySlug } from './constants';

const FALLBACK = 'var(--mep-cat-other)';

export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
	VALID_CATEGORIES.map(cat => [cat, `var(--mep-cat-${categorySlug(cat)})`]),
);

export const SERIES_COLORS: readonly string[] = [
	'var(--mep-series-1)',
	'var(--mep-series-2)',
	'var(--mep-series-3)',
	'var(--mep-series-4)',
	'var(--mep-series-5)',
];

export const SERIES_OTHER = 'var(--mep-series-other)';

export function seriesColor(index: number): string {
	return SERIES_COLORS[index] ?? SERIES_OTHER;
}

function customCategoryColor(category: string): string {
	const slug = categorySlug(category);
	let hash = 0;
	for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
	return SERIES_COLORS[hash % SERIES_COLORS.length] ?? SERIES_OTHER;
}

export function categoryColor(category?: string | null): string {
	if (!category) return FALLBACK;
	return CATEGORY_COLORS[category] ?? customCategoryColor(category);
}

export function categoryTint(category?: string | null, pct = 14): string {
	return `color-mix(in oklab, ${categoryColor(category)} ${pct}%, transparent)`;
}
