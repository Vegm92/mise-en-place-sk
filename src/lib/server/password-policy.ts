export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordPolicyError = 'tooShort' | 'tooLong';

export function passwordPolicyError(password: string): PasswordPolicyError | null {
	if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort';
	if (password.length > MAX_PASSWORD_LENGTH) return 'tooLong';
	return null;
}
