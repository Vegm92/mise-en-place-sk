import { describe, it, expect } from 'vitest';
import {
	MIN_PASSWORD_LENGTH,
	MAX_PASSWORD_LENGTH,
	passwordPolicyError,
} from '../src/lib/server/password-policy';

describe('passwordPolicyError', () => {
	it('rejects passwords shorter than the minimum', () => {
		expect(passwordPolicyError('')).toBe('tooShort');
		expect(passwordPolicyError('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('tooShort');
	});

	it('accepts passwords at and above the minimum', () => {
		expect(passwordPolicyError('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
		expect(passwordPolicyError('a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
	});

	it('rejects passwords above the maximum (bcrypt truncation guard)', () => {
		expect(passwordPolicyError('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toBe('tooLong');
	});

	it('enforces the OWASP floor of 12', () => {
		expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
	});
});
