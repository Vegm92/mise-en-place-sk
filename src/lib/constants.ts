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

export const MIN_CATEGORY_CONFIDENCE = 0.6;

function categoryKey(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toLowerCase();
}

const CANONICAL_BY_KEY = new Map(VALID_CATEGORIES.map(c => [categoryKey(c), c]));

export function categorySlug(value: string): string {
	return categoryKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function resolveSupplierCategory(raw: unknown, confidence?: number | null): string {
	if (typeof raw !== 'string') return UNCATEGORIZED_CATEGORY;
	if (typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < MIN_CATEGORY_CONFIDENCE) {
		return UNCATEGORIZED_CATEGORY;
	}
	return CANONICAL_BY_KEY.get(categoryKey(raw)) ?? UNCATEGORIZED_CATEGORY;
}

/**
 * Supplier "tipo": a broad, closed classification (unlike the legacy single
 * `category`, a supplier can carry more than one at once — a butcher who also
 * sells cheese is both `Comida`). This is the primary filter on Compras
 * screens; `SUPPLIER_TAGS` below are secondary, free, search-only labels.
 */
export const SUPPLIER_TYPES = ['Bebidas', 'Comida', 'Artículos'] as const;
export type SupplierType = typeof SUPPLIER_TYPES[number];

export const SUPPLIER_TAGS: string[] = [
	'Frutas y Verduras', 'Carnes', 'Pescado', 'Lácteos', 'Aceites y Conservas',
	'Refrescos', 'Panadería', 'Especias', 'Limpieza', 'Congelados',
	'Embutidos', 'Vinos y Cavas', 'Café',
];

const CATEGORY_TO_TYPE_AND_TAG: Record<string, { type: SupplierType; tag: string }> = {
	'Frutas y Verduras':        { type: 'Comida',    tag: 'Frutas y Verduras' },
	'Carnes y Derivados':       { type: 'Comida',    tag: 'Carnes' },
	'Pescados y Mariscos':      { type: 'Comida',    tag: 'Pescado' },
	'Lácteos':                  { type: 'Comida',    tag: 'Lácteos' },
	'Aceites y Conservas':      { type: 'Comida',    tag: 'Aceites y Conservas' },
	'Bebidas':                  { type: 'Bebidas',   tag: 'Refrescos' },
	'Panadería y Bollería':     { type: 'Comida',    tag: 'Panadería' },
	'Especias y Condimentos':   { type: 'Comida',    tag: 'Especias' },
	'Productos de Limpieza':    { type: 'Artículos', tag: 'Limpieza' },
	'Congelados':               { type: 'Comida',    tag: 'Congelados' },
	'Embutidos y Charcutería':  { type: 'Comida',    tag: 'Embutidos' },
	'Vinos y Cavas':            { type: 'Bebidas',   tag: 'Vinos y Cavas' },
	'Café y Bebidas Calientes': { type: 'Bebidas',   tag: 'Café' },
};

/** Best-effort tipo+etiqueta for a supplier from its legacy single category (incidencia #22). 'Other'/unknown → sin clasificar, revisar a mano. */
export function deriveSupplierTypeAndTags(category: string | null | undefined): { type: SupplierType[]; tags: string[] } {
	const mapped = category ? CATEGORY_TO_TYPE_AND_TAG[category] : undefined;
	if (!mapped) return { type: [], tags: [] };
	return { type: [mapped.type], tags: [mapped.tag] };
}

/** Same mapping as `deriveSupplierTypeAndTags`, for a single product's category — used to bucket
 * product spend into Bebidas/Comida/Artículos on the spend analytics page. */
export function categoryToType(category: string | null | undefined): SupplierType | null {
	return category ? CATEGORY_TO_TYPE_AND_TAG[category]?.type ?? null : null;
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
