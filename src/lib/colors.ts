/**
 * Chart and category colours, resolved in the browser.
 *
 * These used to be 17 fixed hexes in `constants.ts`, stamped onto rows by the
 * page loads and shipped in the payload. That made them light-only by
 * construction: the server has no idea which theme the browser is in — the
 * choice lives in `localStorage` and is applied to `documentElement` by
 * `static/theme-init.js` — so the same values rendered on both grounds, and
 * eleven of the seventeen fell under 3:1 against the dark surface.
 *
 * Now every category maps to a `--mep-cat-*` custom property with a light and a
 * dark value in `app.css`, and the load functions send only `category`. The
 * colour is picked by the cascade at paint time and re-picks itself when the
 * theme toggles, with no re-render and nothing to keep in sync.
 *
 * Keep this module free of hex codes — `app.css` owns the values.
 */
import { VALID_CATEGORIES, categorySlug } from './constants';

const FALLBACK = 'var(--mep-cat-other)';

/** Canonical category → the custom property holding its colour. */
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
	VALID_CATEGORIES.map(cat => [cat, `var(--mep-cat-${categorySlug(cat)})`]),
);

/**
 * The colour for a category, safe for `background`, `color`, `border-color`
 * and SVG `fill`/`stroke` alike. Unknown or missing categories fall back to
 * the "Other" hue rather than to a literal, so the result is always theme-aware.
 */
export function categoryColor(category?: string | null): string {
	if (!category) return FALLBACK;
	return CATEGORY_COLORS[category] ?? FALLBACK;
}

/**
 * A translucent wash of the category colour, for the soft backgrounds that
 * pair with `categoryColor()` as text — supplier avatars, product badges.
 *
 * This replaces the old `background:{color}24` trick, which built an 8-digit
 * hex by string concatenation. That only ever worked because the value was
 * guaranteed to be a 6-digit hex; against a custom property it produces
 * `var(--mep-cat-bebidas)24`, which is not a colour at all.
 */
export function categoryTint(category?: string | null, pct = 14): string {
	return `color-mix(in oklab, ${categoryColor(category)} ${pct}%, transparent)`;
}

/**
 * The categorical series ramp, for charts whose slices are ranked rather than
 * named — top products, invoice status splits. Fixed order, never cycled: past
 * the fifth entry use SERIES_OTHER rather than wrapping around, so two slices
 * never share a hue.
 *
 * Four components each kept their own copy of this array; it lives here now so
 * a change to the ramp reaches all of them.
 */
export const SERIES_COLORS: readonly string[] = [
	'var(--mep-series-1)',
	'var(--mep-series-2)',
	'var(--mep-series-3)',
	'var(--mep-series-4)',
	'var(--mep-series-5)',
];

export const SERIES_OTHER = 'var(--mep-series-other)';

/** The nth series colour, falling back to the neutral "other" hue. */
export function seriesColor(index: number): string {
	return SERIES_COLORS[index] ?? SERIES_OTHER;
}
