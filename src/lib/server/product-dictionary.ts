const SKU_PREFIX = /^\s*(?:ref|art|cod|c[oó]d(?:igo)?)\b[.:#\s-]*[a-z]*\d[a-z0-9./-]*\s+/i;
const BARE_CODE = /^\s*\d{4,}[.\s-]+/;

const ABBREVIATIONS: Record<string, string> = {
	'tern': 'ternera',
	'ternj': 'ternera',
	'merl': 'merluza',
	'cong': 'congelado',
	'congelad': 'congelado',
	'refrig': 'refrigerado',
	'nat': 'natural',
	'ext': 'extra',
	'esp': 'especial',
	'pza': 'pieza',
	's/h': 'sin hueso',
	'c/h': 'con hueso',
	's/p': 'sin piel',
	'c/p': 'con piel',
	'ud': 'ud',
};

function expandToken(token: string): string {
	const key = token.includes('/') ? token.toLowerCase() : token.replace(/\.+$/, '').toLowerCase();
	return ABBREVIATIONS[key] ?? token;
}

export function expandAbbreviations(raw: string): string {
	let s = (raw ?? '').trim();
	if (!s) return '';

	s = s.replace(SKU_PREFIX, '').replace(BARE_CODE, '').trim();
	if (!s) return raw.trim();

	return s
		.split(/\s+/)
		.map(expandToken)
		.join(' ')
		.trim();
}
