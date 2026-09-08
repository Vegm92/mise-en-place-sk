const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';
const NIE_PREFIX: Record<string, string> = { X: '0', Y: '1', Z: '2' };
const CIF_LETTER_ONLY = 'KPQRSNW';
const CIF_DIGIT_ONLY = 'ABEH';

const DNI_RE = /^\d{8}[A-Z]$/;
const NIE_RE = /^[XYZ]\d{7}[A-Z]$/;
const CIF_RE = /^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/;

const MAX_CACHE = 2000;
const normalizeCache = new Map<string, string | null>();
const validTaxIdCache = new Map<string, boolean>();

export function normalizeTaxId(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const cached = normalizeCache.get(raw);
	if (cached !== undefined) return cached;
	if (normalizeCache.size >= MAX_CACHE) normalizeCache.clear();
	const stripped = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
	const withoutCountry = /^ES[0-9A-Z]{9}$/.test(stripped) ? stripped.slice(2) : stripped;
	const result = withoutCountry || null;
	normalizeCache.set(raw, result);
	return result;
}

function personalControlLetter(digits: string): string {
	return DNI_LETTERS[Number(digits) % 23] ?? '';
}

function cifControlDigit(body: string): number {
	let sum = 0;
	for (let i = 0; i < body.length; i++) {
		const digit = Number(body[i]);
		if (i % 2 === 0) {
			const doubled = digit * 2;
			sum += Math.floor(doubled / 10) + (doubled % 10);
		} else {
			sum += digit;
		}
	}
	return (10 - (sum % 10)) % 10;
}

export function isValidSpanishTaxId(value: string | null | undefined): boolean {
	if (!value) return false;
	const cached = validTaxIdCache.get(value);
	if (cached !== undefined) return cached;
	if (validTaxIdCache.size >= MAX_CACHE) validTaxIdCache.clear();

	const id = normalizeTaxId(value);
	if (!id) {
		validTaxIdCache.set(value, false);
		return false;
	}

	let res = false;
	if (DNI_RE.test(id)) {
		res = id[8] === personalControlLetter(id.slice(0, 8));
	} else if (NIE_RE.test(id)) {
		res = id[8] === personalControlLetter((NIE_PREFIX[id[0] ?? ''] ?? '') + id.slice(1, 8));
	} else if (CIF_RE.test(id)) {
		const kind = id[0]!;
		const control = id[8]!;
		const expected = cifControlDigit(id.slice(1, 8));
		if (CIF_LETTER_ONLY.includes(kind)) {
			res = control === (CIF_CONTROL_LETTERS[expected] ?? '');
		} else if (CIF_DIGIT_ONLY.includes(kind)) {
			res = control === String(expected);
		} else {
			res = control === String(expected) || control === (CIF_CONTROL_LETTERS[expected] ?? '');
		}
	}

	validTaxIdCache.set(value, res);
	return res;
}

export const MIN_TAX_ID_MATCH_CONFIDENCE = 0.85;

export function taxIdDecidesIdentity(value: string | null | undefined, confidence?: number | null): boolean {
	if (!isValidSpanishTaxId(value)) return false;
	if (typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < MIN_TAX_ID_MATCH_CONFIDENCE) {
		return false;
	}
	return true;
}
