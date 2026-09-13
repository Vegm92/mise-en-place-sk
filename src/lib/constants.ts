export const BETA_SEATS = 50;

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
	'Mantenimiento y Reparaciones',
	'Material y Menaje',
	'Embalaje y Packaging',
	'Other',
];

export const MIN_CATEGORY_CONFIDENCE = 0.6;

export const PAYMENT_METHODS = [
	'transferencia',
	'efectivo',
	'tarjeta',
	'domiciliacion',
	'giro',
	'pagare',
	'otro',
] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

export function isValidPaymentMethod(value: unknown): value is PaymentMethod {
	return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export const VENUE_TYPES = [
	{ value: 'menu_del_dia', labelKey: 'onboard.venue.menuDelDia' },
	{ value: 'carta',        labelKey: 'onboard.venue.carta' },
	{ value: 'bar_tapas',    labelKey: 'onboard.venue.barTapas' },
	{ value: 'hotel',        labelKey: 'onboard.venue.hotel' },
	{ value: 'grupo',        labelKey: 'onboard.venue.grupo' },
] as const;

export type VenueType = typeof VENUE_TYPES[number]['value'];

const VENUE_TYPE_VALUES: ReadonlySet<string> = new Set(VENUE_TYPES.map(v => v.value));

export function isValidVenueType(value: unknown): value is VenueType {
	return typeof value === 'string' && VENUE_TYPE_VALUES.has(value);
}

export function isValidCategory(value: unknown): value is string {
	return typeof value === 'string' && VALID_CATEGORIES.includes(value);
}

export const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORY_KEY_CACHE_MAX = 2000;
const categoryKeyCache = new Map<string, string>();

export function categoryKey(value: string): string {
	let cached = categoryKeyCache.get(value);
	if (cached !== undefined) return cached;

	cached = value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toLowerCase();

	if (categoryKeyCache.size >= CATEGORY_KEY_CACHE_MAX) {
		categoryKeyCache.clear();
	}
	categoryKeyCache.set(value, cached);
	return cached;
}

const CANONICAL_BY_KEY = new Map(VALID_CATEGORIES.map(c => [categoryKey(c), c]));

const CATEGORY_SLUG_CACHE_MAX = 2000;
const categorySlugCache = new Map<string, string>();

export function categorySlug(value: string): string {
	let cached = categorySlugCache.get(value);
	if (cached !== undefined) return cached;

	cached = categoryKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	if (categorySlugCache.size >= CATEGORY_SLUG_CACHE_MAX) {
		categorySlugCache.clear();
	}
	categorySlugCache.set(value, cached);
	return cached;
}

export function resolveCategory(raw: unknown, confidence?: number | null): string {
	if (typeof raw !== 'string') return UNCATEGORIZED_CATEGORY;
	if (typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < MIN_CATEGORY_CONFIDENCE) {
		return UNCATEGORIZED_CATEGORY;
	}
	return CANONICAL_BY_KEY.get(categoryKey(raw)) ?? UNCATEGORIZED_CATEGORY;
}

