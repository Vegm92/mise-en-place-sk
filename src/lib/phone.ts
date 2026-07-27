/**
 * Phone-number normalisation for the WhatsApp bot allow-list.
 *
 * Shared (not `$lib/server/`) because the settings UI formats numbers for
 * display while the server normalises them for storage — both need the same
 * rules or a number shown as valid would fail to match on the way in.
 *
 * Storage format is the one Meta delivers in the webhook `from` field: E.164
 * **without** the leading '+', e.g. "34612345678".
 */

/**
 * Default country code applied to bare national numbers. The product is
 * Spain-first and staff type "612 345 678", not "+34 612 345 678"; a 9-digit
 * Spanish number is unambiguous, so we complete it rather than reject it.
 */
export const DEFAULT_COUNTRY_CODE = '34';
const SPANISH_NATIONAL_LENGTH = 9;

/** E.164 allows at most 15 digits; below ~8 nothing is a real mobile number. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

export type NormalizeResult =
	| { ok: true; phone: string }
	| { ok: false; reason: 'empty' | 'tooShort' | 'tooLong' };

/**
 * Normalise user input to Meta's wire format: digits only, no '+', country code
 * included. Accepts "+34 612 345 678", "0034-612345678", "612 345 678".
 */
export function normalizePhoneNumber(input: string): NormalizeResult {
	let digits = (input ?? '').replace(/\D+/g, '');
	if (!digits) return { ok: false, reason: 'empty' };

	// "0034…" is the international prefix written out; strip it before the
	// length checks so it isn't mistaken for extra significant digits.
	if (digits.startsWith('00')) digits = digits.slice(2);

	// A bare national number gets the default country code. Done before the
	// minimum-length check so a valid 9-digit Spanish mobile isn't rejected.
	if (digits.length === SPANISH_NATIONAL_LENGTH) digits = DEFAULT_COUNTRY_CODE + digits;

	if (digits.length < MIN_DIGITS) return { ok: false, reason: 'tooShort' };
	if (digits.length > MAX_DIGITS) return { ok: false, reason: 'tooLong' };

	return { ok: true, phone: digits };
}

/** Format for display: "+34 612 345 678" — storage stays digits-only. */
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
