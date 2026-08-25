import { TURNSTILE_SECRET_KEY } from './env';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(
	token: string,
	ip: string,
	secret: string = TURNSTILE_SECRET_KEY,
): Promise<boolean> {
	if (!secret) return true;
	if (!token) return false;
	try {
		const res = await fetch(SITEVERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ secret, response: token, remoteip: ip }),
		});
		if (!res.ok) {
			console.error(`[turnstile] siteverify returned ${res.status} — allowing the request`);
			return true;
		}
		const outcome = (await res.json()) as { success?: boolean };
		return outcome.success === true;
	} catch (e) {
		console.error('[turnstile] siteverify unreachable — allowing the request:', e);
		return true;
	}
}
