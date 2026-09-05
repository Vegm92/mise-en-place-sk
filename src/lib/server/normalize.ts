const DIACRITICS_RE = /[\u0300-\u036f]/g;
const WHITESPACE_RE = /\s+/g;
const DOTS_SPACES_RE = /[.\s]/g;
const PUNCT_RE = /[.,]/g;
const TRAILING_DOTS_RE = /(?<!\.)\.+$/;

const NORM_KEY_CACHE_MAX = 4000;
const normKeyCache = new Map<string, string>();

export function normalizeProductKey(raw: string): string {
	let cached = normKeyCache.get(raw);
	if (cached !== undefined) return cached;

	cached = raw
		.normalize('NFD')
		.replace(DIACRITICS_RE, '')
		.toLowerCase()
		.replace(WHITESPACE_RE, ' ')
		.trim();

	if (normKeyCache.size >= NORM_KEY_CACHE_MAX) {
		normKeyCache.clear();
	}
	normKeyCache.set(raw, cached);
	return cached;
}

const SPANISH_LEGAL_FORM_TOKENS: string[][] = [
	['s', 'l', 'u'],
	['s', 'l', 'n', 'e'],
	['s', 'a', 'u'],
	['s', 'c', 'p'],
	['s', 'coop'],
	['coop'],
	['s', 'l'],
	['s', 'a'],
	['s', 'c'],
	['c', 'b'],
];

const SPANISH_LEGAL_FORM_ALTERNATIVES = SPANISH_LEGAL_FORM_TOKENS.map((tokens) =>
	tokens.map((token) => `${token}\\.?`).join('\\s*'),
).join('|');

const SPANISH_LEGAL_FORM_RE = new RegExp(
	`(?:^|[,.]\\s*|\\s)(${SPANISH_LEGAL_FORM_ALTERNATIVES})\\s*$`,
	'i',
);

export interface ParsedSupplierName {
	base: string;
	legalForm: string | null;
}

const SUPPLIER_NAME_CACHE_MAX = 4000;
const supplierNameCache = new Map<string, ParsedSupplierName>();

export function parseSupplierName(raw: string): ParsedSupplierName {
	let cached = supplierNameCache.get(raw);
	if (cached !== undefined) return cached;

	const cleaned = normalizeProductKey(raw);
	const match = cleaned.match(SPANISH_LEGAL_FORM_RE);
	const legalForm = match ? match[1].replace(DOTS_SPACES_RE, '') : null;
	const base = cleaned
		.replace(SPANISH_LEGAL_FORM_RE, '')
		.replace(PUNCT_RE, ' ')
		.replace(WHITESPACE_RE, ' ')
		.trim();

	cached = { base, legalForm };

	if (supplierNameCache.size >= SUPPLIER_NAME_CACHE_MAX) {
		supplierNameCache.clear();
	}
	supplierNameCache.set(raw, cached);
	return cached;
}

export function normalizeSupplierName(raw: string): string {
	return parseSupplierName(raw).base;
}

export function isSameSupplierName(a: string, b: string): boolean {
	const pa = parseSupplierName(a);
	const pb = parseSupplierName(b);
	if (!pa.base || pa.base !== pb.base) return false;
	if (pa.legalForm && pb.legalForm && pa.legalForm !== pb.legalForm) return false;
	return true;
}

export const UNIT_GROUPS: Record<string, string[]> = {
	kg:        ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kgm'],
	g:         ['g', 'gr', 'grs', 'gramo', 'gramos', 'grm'],
	mg:        ['mg', 'mgm', 'miligramo', 'miligramos'],
	L:         ['l', 'lt', 'lts', 'litro', 'litros', 'ltr'],
	ml:        ['ml', 'mls', 'mililitro', 'mililitros', 'mlt'],
	cl:        ['cl', 'centilitro', 'centilitros', 'clt'],
	ud:        ['ud', 'uds', 'u', 'un', 'unid', 'unids', 'unidad', 'unidades', 'c62', 'ea', 'h87', 'pce'],
	pieza:     ['pz', 'pza', 'pzas', 'pieza', 'piezas'],
	caja:      ['caja', 'cajas', 'cj', 'bx', 'xbx', 'cs', 'xcs', 'cr', 'xcr', 'ct', 'xct'],
	bote:      ['bote', 'botes'],
	bolsa:     ['bolsa', 'bolsas', 'bg', 'xbg'],
	sobre:     ['sobre', 'sobres'],
	lata:      ['lata', 'latas', 'can'],
	botella:   ['botella', 'botellas', 'btl', 'bo', 'xbo'],
	garrafa:   ['garrafa', 'garrafas'],
	'bidón':   ['bidon', 'bidones'],
	bombona:   ['bombona', 'bombonas'],
	barril:    ['barril', 'barriles'],
	brik:      ['brik', 'briks', 'tetrabrik', 'tetra brik'],
	cubeta:    ['cubeta', 'cubetas'],
	estuche:   ['estuche', 'estuches'],
	tarrina:   ['tarrina', 'tarrinas'],
	docena:    ['docena', 'docenas', 'dzn'],
	manojo:    ['manojo', 'manojos', 'atado', 'atados'],
	bandeja:   ['bandeja', 'bandejas'],
	barqueta:  ['barqueta', 'barquetas'],
	saco:      ['saco', 'sacos', 'sa', 'xsa'],
	pack:      ['pack', 'packs', 'pk', 'xpk'],
	paquete:   ['paquete', 'paquetes', 'paq', 'pqt'],
	'ración':  ['racion', 'raciones'],
	rollo:     ['rollo', 'rollos'],
	bulto:     ['bulto', 'bultos'],
	'palé':    ['pale', 'pales', 'palet', 'palets', 'pallet', 'pallets'],
	hora:      ['hora', 'horas', 'hur'],
	m:         ['m', 'metro', 'metros', 'mtr'],
	cm:        ['cm', 'cms', 'centimetro', 'centimetros', 'cmt'],
	mm:        ['mm', 'milimetro', 'milimetros', 'mmt'],
	km:        ['km', 'kms', 'kilometro', 'kilometros', 'kmt'],
	m2:        ['m2', 'mtk'],
	m3:        ['m3', 'mtq'],
	kWh:       ['kwh'],
};

const UNIT_SYNONYMS = new Map<string, string>();
for (const [canonical, variants] of Object.entries(UNIT_GROUPS)) {
	for (const v of variants) UNIT_SYNONYMS.set(v, canonical);
}

const UNIT_CACHE_MAX = 1000;
const unitCache = new Map<string, string | null>();

export function canonicalizeUnit(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const key = String(raw);
	let cached = unitCache.get(key);
	if (cached !== undefined) return cached;

	const normKey = normalizeProductKey(key).replace(TRAILING_DOTS_RE, '');
	cached = normKey ? (UNIT_SYNONYMS.get(normKey) ?? null) : null;

	if (unitCache.size >= UNIT_CACHE_MAX) {
		unitCache.clear();
	}
	unitCache.set(key, cached);
	return cached;
}
