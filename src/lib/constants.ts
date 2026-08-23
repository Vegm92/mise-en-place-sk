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
	'Café y Bebidas Calientes':      '#4A3324',
	'Mantenimiento y Reparaciones':  '#5C5C5C',
	'Material y Menaje':             '#7A6B55',
	'Embalaje y Packaging':          '#6B7A5C',
	'Other':                         '#555566',
};
