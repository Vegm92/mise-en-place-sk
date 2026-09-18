import { createVerificationToken } from './verification-token';
import { sendEmail, verifyEmailAddress } from './email';
import { siteOrigin } from './site-origin';

export async function sendVerificationEmail(url: URL, email: string): Promise<void> {
	const token = await createVerificationToken(`verify-email:${email}`);
	const verifyUrl = `${siteOrigin(url)}/verify-email?email=${encodeURIComponent(email)}&token=${token}`;
	await sendEmail(verifyEmailAddress(email, verifyUrl));
}
