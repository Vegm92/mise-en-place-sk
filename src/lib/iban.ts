const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;

export function normalizeIban(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const stripped = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
	return stripped || null;
}

// Mod-97 check per ISO 7064: move the first 4 chars to the end, convert
// letters to numbers (A=10 … Z=35), and the result mod 97 must equal 1.
export function isValidIban(value: string | null | undefined): boolean {
	const iban = normalizeIban(value);
	if (!iban || !IBAN_RE.test(iban)) return false;

	const rearranged = iban.slice(4) + iban.slice(0, 4);
	const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

	let remainder = 0;
	for (let i = 0; i < digits.length; i++) {
		remainder = (remainder * 10 + Number(digits[i])) % 97;
	}
	return remainder === 1;
}
