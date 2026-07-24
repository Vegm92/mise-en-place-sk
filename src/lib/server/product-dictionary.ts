/**
 * Static Spanish food-trade dictionary (issue #300, Phase 4).
 *
 * Cheap, deterministic pre-processing so the common cases never reach the LLM:
 *   - strip leading SKU/reference codes ("REF.1042 TOMATE PERA" → "TOMATE PERA");
 *   - expand high-frequency abbreviations ("TERN. AGUJA" → "ternera aguja",
 *     "MERL. GRANDE" → "merluza grande", "S/H" → "sin hueso").
 *
 * expandAbbreviations returns a cleaned display string; callers still run it
 * through normalizeProductKey for matching. Pure module — no DB, no LLM.
 */

// Leading SKU / article-code prefixes: "REF.1042", "ART 55-A", "COD: X12",
// "código 900". The code part must contain a digit so plain words starting
// with these letters ("REFRESCO", "ARTESANO") are never stripped.
const SKU_PREFIX = /^\s*(?:ref|art|cod|c[oó]d(?:igo)?)\b[.:#\s-]*[a-z]*\d[a-z0-9./-]*\s+/i;
// A bare leading numeric code of 4+ digits ("1042 TOMATE"). Three digits or
// fewer are left alone — they are usually a size ("500 g", "330 ml").
const BARE_CODE = /^\s*\d{4,}[.\s-]+/;

// token (optionally trailing dot) → expansion. Matched whole-token,
// case-insensitively, after accent folding is NOT applied (kept literal so
// "s/h" survives). Conservative on purpose: abbreviations only, no risky
// cross-product synonyms.
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
	'ud': 'ud', // keep unit-ish tokens intact
};

function expandToken(token: string): string {
	// Preserve slash tokens like "s/h" as a whole; otherwise strip trailing dots.
	const key = token.includes('/') ? token.toLowerCase() : token.replace(/\.+$/, '').toLowerCase();
	return ABBREVIATIONS[key] ?? token;
}

export function expandAbbreviations(raw: string): string {
	let s = (raw ?? '').trim();
	if (!s) return '';

	// Strip a leading code prefix (once).
	s = s.replace(SKU_PREFIX, '').replace(BARE_CODE, '').trim();
	if (!s) return raw.trim(); // never return empty from a non-empty input

	return s
		.split(/\s+/)
		.map(expandToken)
		.join(' ')
		.trim();
}
