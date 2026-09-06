export const CONSENT_COOKIE = 'mep_consent';

export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export type ConsentChoice = 'granted' | 'denied';

export type ConsentState = ConsentChoice | 'unset';

export function parseConsent(raw: string | null | undefined): ConsentState {
	if (raw === 'granted') return 'granted';
	if (raw === 'denied') return 'denied';
	return 'unset';
}

export function analyticsAllowed(state: ConsentState): boolean {
	return state === 'granted';
}
