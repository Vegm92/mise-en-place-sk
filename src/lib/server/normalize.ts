/**
 * Shared product/unit normalization (issue #296).
 *
 * normalizeProductKey is the single TS-side definition of "same product":
 * lowercase, accent-folded, whitespace-collapsed. It MUST stay in lockstep
 * with the SQL function mep_norm_key (drizzle/0018_product_key_normalization.sql),
 * which is the same transform expressed in Postgres and used by the
 * materialized views and cross-invoice matching queries.
 *
 * canonicalizeUnit folds the many ways Spanish suppliers (and e-invoice
 * standards) write a unit into one canonical spelling — "Kgs", "KILO" and
 * UN/ECE "KGM" all resolve to "kg". Unknown units return null so callers can
 * flag requiresUnitConversion instead of treating a mystery token as a unit.
 *
 * Pure module — no DB imports, safe for the worker and for unit tests.
 */

export function normalizeProductKey(raw: string): string {
	return raw
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

// canonical spelling → accepted variants (variants are matched after
// normalizeProductKey + trailing-dot strip, so list them lowercase/unaccented).
// UN/ECE Rec 20/21 codes (UBL unitCode) are folded in directly: KGM, LTR, C62…
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

/**
 * Resolve any spelling of a unit to its canonical form, or null when the
 * token is not a recognized unit (→ caller flags requiresUnitConversion).
 * "media caja", "garrafa 5L" and similar sized-container formats are
 * deliberately NOT mapped: they need a conversion factor, not a pass-through.
 */
export function canonicalizeUnit(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const key = normalizeProductKey(String(raw)).replace(/\.+$/, '');
	if (!key) return null;
	return UNIT_SYNONYMS.get(key) ?? null;
}
