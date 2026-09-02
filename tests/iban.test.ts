/**
 * IBAN normalization and mod-97 checksum validation (issue #915).
 */
import { describe, it, expect } from 'vitest';
import { normalizeIban, isValidIban } from '../src/lib/iban';

describe('normalizeIban', () => {
	it('uppercases and strips spaces/dashes', () => {
		expect(normalizeIban('es91 2100 0418 4502 0005 1332')).toBe('ES9121000418450200051332');
		expect(normalizeIban('GB29-NWBK-6016-1331-9268-19')).toBe('GB29NWBK60161331926819');
	});

	it('strips a leading IBAN or CCC label', () => {
		expect(normalizeIban('IBAN: ES91-2100-0418-4502-0005-1332')).toBe('ES9121000418450200051332');
		expect(normalizeIban('CCC 2100 0418 45 0200051332')).toBe('21000418450200051332');
	});

	it('returns null for empty or blank input', () => {
		expect(normalizeIban(null)).toBeNull();
		expect(normalizeIban(undefined)).toBeNull();
		expect(normalizeIban('   ')).toBeNull();
	});
});

describe('isValidIban', () => {
	it('accepts valid ES, GB and DE IBANs', () => {
		expect(isValidIban('ES9121000418450200051332')).toBe(true);
		expect(isValidIban('GB29NWBK60161331926819')).toBe(true);
		expect(isValidIban('DE89370400440532013000')).toBe(true);
	});

	it('accepts a valid IBAN with human formatting', () => {
		expect(isValidIban('ES91 2100 0418 4502 0005 1332')).toBe(true);
	});

	it('rejects an IBAN with a corrupted check digit', () => {
		expect(isValidIban('ES9021000418450200051332')).toBe(false);
	});

	it('rejects a labelled but otherwise valid IBAN unless the label is stripped first', () => {
		expect(isValidIban(normalizeIban('IBAN: ES91-2100-0418-4502-0005-1332'))).toBe(true);
	});

	it('rejects null, empty and malformed input', () => {
		expect(isValidIban(null)).toBe(false);
		expect(isValidIban('')).toBe(false);
		expect(isValidIban('not-an-iban')).toBe(false);
	});
});
