export const DEFAULT_COUNTRY_CODE = '34';
const SPANISH_NATIONAL_LENGTH = 9;

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

export type NormalizeResult =
	| { ok: true; phone: string }
	| { ok: false; reason: 'empty' | 'tooShort' | 'tooLong' };

export function normalizePhoneNumber(input: string): NormalizeResult {
	let digits = (input ?? '').replace(/\D+/g, '');
	if (!digits) return { ok: false, reason: 'empty' };

	if (digits.startsWith('00')) digits = digits.slice(2);

	if (digits.length === SPANISH_NATIONAL_LENGTH) digits = DEFAULT_COUNTRY_CODE + digits;

	if (digits.length < MIN_DIGITS) return { ok: false, reason: 'tooShort' };
	if (digits.length > MAX_DIGITS) return { ok: false, reason: 'tooLong' };

	return { ok: true, phone: digits };
}

export function waMeLink(phone: string): string {
	return `https://wa.me/${phone.replace(/\D+/g, '')}`;
}

export function formatPhoneNumber(phone: string): string {
	if (
		phone.startsWith(DEFAULT_COUNTRY_CODE) &&
		phone.length === DEFAULT_COUNTRY_CODE.length + SPANISH_NATIONAL_LENGTH
	) {
		const national = phone.slice(DEFAULT_COUNTRY_CODE.length);
		return `+${DEFAULT_COUNTRY_CODE} ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
	}
	return `+${phone}`;
}
