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
