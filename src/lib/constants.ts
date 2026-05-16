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

export const VALID_CATEGORIES: string[] = [
	'Wine & Spirits',
	'Seafood',
	'Meat',
	'Produce',
	'Dry Goods',
	'Beverages',
	'Other',
];

export const CATEGORY_COLORS: Record<string, string> = {
	'Wine & Spirits': '#8B3530',
	Seafood: '#2C5F8A',
	Meat: '#6B4423',
	Produce: '#3B6B20',
	'Dry Goods': '#3A5E28',
	Beverages: '#1B5E5E',
	Other: '#555566',
};
