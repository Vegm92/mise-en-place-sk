export const INVOICE_STATUS_BG: Record<string, string> = {
	pending:  '#F3F4F6',
	paid:     '#F0FDF4',
	overdue:  '#FFF1F0',
	due_soon: '#FFFBEB',
};

export const INVOICE_STATUS_COLOR: Record<string, string> = {
	pending:  '#555555',
	paid:     '#166534',
	overdue:  '#B91C1C',
	due_soon: '#92400E',
};

export const INVOICE_BADGE_CLS: Record<string, string> = {
	pending:  'bg-[#FFF8EE] text-[#C8843A]',
	paid:     'bg-[#F0FDF4] text-[#3A8C5C]',
	overdue:  'bg-[#FFF1F0] text-[#E05555]',
	due_soon: 'bg-[#FFF8EE] text-[#C8843A]',
};

export const SUPPLIER_BADGE_CLS: Record<string, string> = {
	overdue:  'bg-[#FFF1F0] text-[#E05555]',
	due_soon: 'bg-[#FFF8EE] text-[#C8843A]',
	paid_up:  'bg-[#F0FDF4] text-[#3A8C5C]',
};

export const SUPPLIER_BADGE_LABEL: Record<string, string> = {
	overdue:  'Overdue',
	due_soon: 'Due soon',
	paid_up:  'Paid up',
};

export const CONFIDENCE_BADGE_CLS: Record<string, string> = {
	high:   'bg-[#F0FDF4] text-[#3A8C5C]',
	medium: 'bg-[#FFF8EE] text-[#C8843A]',
	low:    'bg-[#FFF1F0] text-[#E05555]',
};

// Canonical category taxonomy — single source of truth for the whole app.
// Suppliers (suppliers.category) and budgets (category_budgets.category) MUST
// store one of these exact strings. The synth seed generators and a guard test
// (tests/category-taxonomy.test.ts) enforce this; do not diverge.
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

export const PRICE_STABILITY_BADGE: Record<string, { label: string; color: string; bg: string }> = {
	stable:   { label: 'Stable prices',    color: '#3A8C5C', bg: '#F0FDF4' },
	moderate: { label: 'Some variation',   color: '#C8843A', bg: '#FFF8EE' },
	volatile: { label: 'Volatile pricing', color: '#E05555', bg: '#FFF1F0' },
};

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
