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

export function resolveCategory(raw: unknown, confidence?: number | null): string {
	if (typeof raw !== 'string') return UNCATEGORIZED_CATEGORY;
	if (typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < MIN_CATEGORY_CONFIDENCE) {
		return UNCATEGORIZED_CATEGORY;
	}
	return CANONICAL_BY_KEY.get(categoryKey(raw)) ?? UNCATEGORIZED_CATEGORY;
}

export const PERIOD_PILLS = [
	{ value: '7d',  labelKey: 'period.7d'  },
	{ value: '30d', labelKey: 'period.30d' },
	{ value: '3m',  labelKey: 'period.3m'  },
	{ value: '6m',  labelKey: 'period.6m'  },
	{ value: '1y',  labelKey: 'period.1y'  },
] as const;

export function periodToDate(p: string): Date {
	const d = new Date();
	const map: Record<string, () => void> = {
		'7d':  () => d.setDate(d.getDate() - 7),
		'30d': () => d.setDate(d.getDate() - 30),
		'3m':  () => d.setMonth(d.getMonth() - 3),
		'6m':  () => d.setMonth(d.getMonth() - 6),
		'1y':  () => d.setFullYear(d.getFullYear() - 1),
	};
	(map[p] ?? map['30d'])();
	return d;
}
