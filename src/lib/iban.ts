const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;

const MAX_CACHE_ENTRIES = 2000;
const normalizeCache = new Map<string, string | null>();
const validIbanCache = new Map<string, boolean>();

export function normalizeIban(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const cached = normalizeCache.get(raw);
	if (cached !== undefined) return cached;

	const stripped = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
	const res = stripped || null;
	if (normalizeCache.size >= MAX_CACHE_ENTRIES) normalizeCache.clear();
	normalizeCache.set(raw, res);
	return res;
}

export function isValidIban(value: string | null | undefined): boolean {
	if (!value) return false;
	const cached = validIbanCache.get(value);
	if (cached !== undefined) return cached;

	const iban = normalizeIban(value);
	if (!iban || !IBAN_RE.test(iban)) {
		if (validIbanCache.size >= MAX_CACHE_ENTRIES) validIbanCache.clear();
		validIbanCache.set(value, false);
		return false;
	}

	const rearranged = iban.slice(4) + iban.slice(0, 4);
	const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

	let remainder = 0;
	for (let i = 0; i < digits.length; i++) {
		remainder = (remainder * 10 + Number(digits[i])) % 97;
	}
	const res = remainder === 1;
	if (validIbanCache.size >= MAX_CACHE_ENTRIES) validIbanCache.clear();
	validIbanCache.set(value, res);
	return res;
}
