const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;
const LABEL_PREFIX_RE = /^(IBAN|CCC)/;

export function normalizeIban(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const stripped = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(LABEL_PREFIX_RE, '');
	return stripped || null;
}

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
