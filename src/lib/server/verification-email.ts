import { createVerificationToken } from './verification-token';
import { sendEmail, verifyEmailAddress } from './email';

export async function sendVerificationEmail(url: URL, email: string): Promise<void> {
	const token = await createVerificationToken(`verify-email:${email}`);
	const verifyUrl = `${url.origin}/verify-email?email=${encodeURIComponent(email)}&token=${token}`;
	await sendEmail(verifyEmailAddress(email, verifyUrl));
}
