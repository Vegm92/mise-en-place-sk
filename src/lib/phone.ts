export const DEFAULT_COUNTRY_CODE = '34';
const SPANISH_NATIONAL_LENGTH = 9;

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

export type NormalizeResult =
	| { ok: true; phone: string }
	| { ok: false; reason: 'empty' | 'tooShort' | 'tooLong' };

const NORMALIZE_PHONE_CACHE_MAX = 2000;
const normalizePhoneCache = new Map<string, NormalizeResult>();

export function normalizePhoneNumber(input: string): NormalizeResult {
	let cached = normalizePhoneCache.get(input);
	if (cached !== undefined) return cached;

	let digits = (input ?? '').replace(/\D+/g, '');
	if (!digits) {
		cached = { ok: false, reason: 'empty' };
	} else {
		if (digits.startsWith('00')) digits = digits.slice(2);

		if (digits.length === SPANISH_NATIONAL_LENGTH) digits = DEFAULT_COUNTRY_CODE + digits;

		if (digits.length < MIN_DIGITS) cached = { ok: false, reason: 'tooShort' };
		else if (digits.length > MAX_DIGITS) cached = { ok: false, reason: 'tooLong' };
		else cached = { ok: true, phone: digits };
	}

	if (normalizePhoneCache.size >= NORMALIZE_PHONE_CACHE_MAX) {
		normalizePhoneCache.clear();
	}
	normalizePhoneCache.set(input, cached);
	return cached;
}

export function waMeLink(phone: string): string {
	return `https://wa.me/${phone.replace(/\D+/g, '')}`;
}

const FORMAT_PHONE_CACHE_MAX = 2000;
const formatPhoneCache = new Map<string, string>();

export function formatPhoneNumber(phone: string): string {
	let cached = formatPhoneCache.get(phone);
	if (cached !== undefined) return cached;

	if (
		phone.startsWith(DEFAULT_COUNTRY_CODE) &&
		phone.length === DEFAULT_COUNTRY_CODE.length + SPANISH_NATIONAL_LENGTH
	) {
		const national = phone.slice(DEFAULT_COUNTRY_CODE.length);
		cached = `+${DEFAULT_COUNTRY_CODE} ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
	} else {
		cached = `+${phone}`;
	}

	if (formatPhoneCache.size >= FORMAT_PHONE_CACHE_MAX) {
		formatPhoneCache.clear();
	}
	formatPhoneCache.set(phone, cached);
	return cached;
}
