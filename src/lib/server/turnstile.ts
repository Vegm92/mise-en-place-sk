import { TURNSTILE_SECRET_KEY } from './env';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_ATTEMPTS = 2;
const SITEVERIFY_RETRY_DELAY_MS = 300;

export type TurnstileOutcome = 'verified' | 'rejected' | 'unavailable';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function siteverify(secret: string, token: string, ip: string): Promise<boolean> {
	const res = await fetch(SITEVERIFY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ secret, response: token, remoteip: ip }),
	});
	if (!res.ok) throw new Error(`siteverify returned ${res.status}`);
	const outcome = (await res.json()) as { success?: boolean };
	return outcome.success === true;
}

export async function verifyTurnstileToken(
	token: string,
	ip: string,
	secret: string = TURNSTILE_SECRET_KEY,
): Promise<TurnstileOutcome> {
	if (!secret) return 'verified';
	if (!token) return 'rejected';
	for (let attempt = 1; ; attempt++) {
		try {
			return (await siteverify(secret, token, ip)) ? 'verified' : 'rejected';
		} catch (e) {
			if (attempt >= SITEVERIFY_ATTEMPTS) {
				console.error(`[turnstile] siteverify unavailable after ${attempt} attempts:`, e);
				return 'unavailable';
			}
			console.warn(`[turnstile] siteverify attempt ${attempt} failed, retrying:`, e);
			await sleep(SITEVERIFY_RETRY_DELAY_MS);
		}
	}
}
