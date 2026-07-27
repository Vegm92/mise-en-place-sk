// Canonical category taxonomy — single source of truth for the whole app.
// Suppliers (suppliers.category) and budgets (category_budgets.category) MUST
// store one of these exact strings. The synth seed generators and a guard test
// (tests/category-taxonomy.test.ts) enforce this; do not diverge.
/**
 * Bucket for suppliers nobody has categorised (issue #301). Stored, not
 * fabricated per query: `getOrCreateSupplierId` writes it on creation, the
 * budget check and analytics coalesce legacy NULLs into it, and the UI renders
 * it as "Sin categoría" / "Uncategorised" rather than as a literal category.
 */
export const UNCATEGORIZED_CATEGORY = 'Other';

export const VALID_CATEGORIES: string[] = [
	'Frutas y Verduras',
	'Carnes y Derivados',
	'Pescados y Mariscos',
	'Lácteos',
	'Aceites y Conservas',
	'Bebidas',
	'Panadería y Bollería',
	'Especias y Condimentos',
	'Productos de Limpieza',
	'Congelados',
	'Embutidos y Charcutería',
	'Vinos y Cavas',
	'Café y Bebidas Calientes',
	'Other',
];

/**
 * Confidence floor for a machine-proposed category (issue #315). Matches the
 * "below 0.60 = poor quality, missing, or illegible" band the extraction prompt
 * already defines: under it the model is telling us the document was barely
 * readable, and a coin-flip category is worse than an honest "Other".
 */
export const MIN_CATEGORY_CONFIDENCE = 0.6;

/** Case- and accent-insensitive lookup key, so 'lacteos' finds 'Lácteos'. */
function categoryKey(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toLowerCase();
}

const CANONICAL_BY_KEY = new Map(VALID_CATEGORIES.map(c => [categoryKey(c), c]));

/**
 * The only door into `suppliers.category` for a machine-proposed value
 * (issue #315).
 *
 * Extraction asks Gemini for one exact string from VALID_CATEGORIES, but a
 * model will also return a translation, an invented category, or an unaccented
 * lower-cased variant. This maps a recognisable spelling back onto its
 * canonical string and turns *everything* else — including a guess the model
 * itself reports as low-confidence — into the uncategorised bucket, so a bad
 * guess degrades into "Other" plus the existing categorisation nudge instead of
 * poisoning the taxonomy the budgets page groups on.
 *
 * Always returns a member of VALID_CATEGORIES; never null, never a new string.
 *
 * @param confidence Model-reported confidence. Absent or non-numeric means the
 *   model didn't report one (older prompt cache, dropped field) — that falls
 *   back to trusting the taxonomy match rather than discarding a good category.
 */
export function resolveSupplierCategory(raw: unknown, confidence?: number | null): string {
	if (typeof raw !== 'string') return UNCATEGORIZED_CATEGORY;
	if (typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < MIN_CATEGORY_CONFIDENCE) {
		return UNCATEGORIZED_CATEGORY;
	}
	return CANONICAL_BY_KEY.get(categoryKey(raw)) ?? UNCATEGORIZED_CATEGORY;
}

export const CATEGORY_COLORS: Record<string, string> = {
	'Frutas y Verduras':        '#3B6B20',
	'Carnes y Derivados':       '#8B3530',
	'Pescados y Mariscos':      '#2C5F8A',
	'Lácteos':                  '#C9A227',
	'Aceites y Conservas':      '#9A7B1E',
	'Bebidas':                  '#1B5E5E',
	'Panadería y Bollería':     '#A8642B',
	'Especias y Condimentos':   '#7A3B6B',
	'Productos de Limpieza':    '#4A6B7A',
	'Congelados':               '#3A6E8B',
	'Embutidos y Charcutería':  '#7A2E2A',
	'Vinos y Cavas':            '#6B4423',
	'Café y Bebidas Calientes': '#4A3324',
	'Other':                    '#555566',
};
