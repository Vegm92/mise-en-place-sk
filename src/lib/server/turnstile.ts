import { TURNSTILE_SECRET_KEY } from './env';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RETRY_DELAY_MS = 250;

async function siteverify(secret: string, token: string, ip: string): Promise<boolean | null> {
	const res = await fetch(SITEVERIFY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ secret, response: token, remoteip: ip }),
	});
	if (!res.ok) {
		console.error(`[turnstile] siteverify returned ${res.status}`);
		return null;
	}
	const outcome = (await res.json()) as { success?: boolean };
	return outcome.success === true;
}

export async function verifyTurnstileToken(
	token: string,
	ip: string,
	secret: string = TURNSTILE_SECRET_KEY,
): Promise<boolean> {
	if (!secret) return true;
	if (!token) return false;

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const outcome = await siteverify(secret, token, ip);
			if (outcome !== null) return outcome;
		} catch (e) {
			console.error('[turnstile] siteverify unreachable:', e);
		}
		if (attempt === 0) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
	}

	const failClosed = process.env.NODE_ENV === 'production';
	console.error(`[turnstile] siteverify unavailable — ${failClosed ? 'denying' : 'allowing'} the request`);
	return !failClosed;
}
