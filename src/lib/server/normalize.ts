export function normalizeProductKey(raw: string): string {
	return raw
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

const SPANISH_LEGAL_FORM_RE =
	/[,.]?\s*(s\.?\s*l\.?\s*u\.?|s\.?\s*l\.?\s*n\.?\s*e\.?|s\.?\s*a\.?\s*u\.?|s\.?\s*c\.?\s*p\.?|s\.?\s*coop\.?|coop\.?|s\.?\s*l\.?|s\.?\s*a\.?|s\.?\s*c\.?|c\.?\s*b\.?)\s*$/i;

export interface ParsedSupplierName {
	base: string;
	legalForm: string | null;
}

export function parseSupplierName(raw: string): ParsedSupplierName {
	const cleaned = raw
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
	const match = cleaned.match(SPANISH_LEGAL_FORM_RE);
	const legalForm = match ? match[1].replace(/[.\s]/g, '') : null;
	const base = cleaned
		.replace(SPANISH_LEGAL_FORM_RE, '')
		.replace(/[.,]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return { base, legalForm };
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

const UNIT_GROUPS: Record<string, string[]> = {
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

export function canonicalizeUnit(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const key = normalizeProductKey(String(raw)).replace(/\.+$/, '');
	if (!key) return null;
	return UNIT_SYNONYMS.get(key) ?? null;
}
