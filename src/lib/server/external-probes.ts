import { GoogleGenAI } from '@google/genai';
import { Resend } from 'resend';
import { stripe } from './billing';
import {
	GEMINI_API_KEY, GEMINI_MODEL, STRIPE_PRICE_ID_STARTER,
	WHATSAPP_ACCESS_TOKEN, WHATSAPP_API_VERSION, WHATSAPP_PHONE_NUMBER_ID,
} from './env';
import { withTimeout } from './with-timeout';

export type ProbeState = 'ok' | 'unreachable' | 'unconfigured';

export interface ProbeResult {
	state: ProbeState;
	detail: string;
	latencyMs: number | null;
	checkedAt: string;
}

const PROBE_TIMEOUT_MS = 4000;
const PROBE_CACHE_MS = 60_000;
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';

const cache = new Map<string, ProbeResult>();

function errorText(err: unknown): string {
	const message = err instanceof Error ? err.message : String(err);
	const json = message.indexOf('{');
	if (json >= 0) {
		try {
			const parsed = JSON.parse(message.slice(json)) as { error?: { message?: string; code?: number; status?: string }; message?: string };
			const inner = parsed.error?.message ?? parsed.message;
			if (inner) return `${parsed.error?.code ?? parsed.error?.status ?? ''} ${inner}`.trim().slice(0, 160);
		} catch {
			return message.replace(/\s+/g, ' ').slice(0, 160);
		}
	}
	return message.replace(/\s+/g, ' ').slice(0, 160);
}

async function probe(name: string, configured: boolean, run: (signal: AbortSignal) => Promise<string>): Promise<ProbeResult> {
	if (!configured) return { state: 'unconfigured', detail: 'Not configured', latencyMs: null, checkedAt: new Date().toISOString() };
	const cached = cache.get(name);
	if (cached && Date.now() - new Date(cached.checkedAt).getTime() < PROBE_CACHE_MS) return cached;
	const started = Date.now();
	let result: ProbeResult;
	try {
		const detail = await withTimeout(`probe/${name}`, PROBE_TIMEOUT_MS, run);
		result = { state: 'ok', detail, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
	} catch (err) {
		result = { state: 'unreachable', detail: errorText(err), latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
	}
	cache.set(name, result);
	return result;
}

export function resetProbeCache(): void {
	cache.clear();
}

export function probeGemini(): Promise<ProbeResult> {
	return probe('gemini', Boolean(GEMINI_API_KEY), async () => {
		const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
		const model = await ai.models.get({ model: GEMINI_MODEL });
		return `${model.name ?? GEMINI_MODEL} reachable`;
	});
}

export function probeStripe(): Promise<ProbeResult> {
	return probe('stripe', stripe !== null, async () => {
		if (!STRIPE_PRICE_ID_STARTER) {
			await stripe!.balance.retrieve();
			return 'API reachable · STRIPE_PRICE_ID_STARTER unset';
		}
		const price = await stripe!.prices.retrieve(STRIPE_PRICE_ID_STARTER);
		const amount = price.unit_amount != null ? `${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}` : 'no amount';
		return `API reachable · starter price ${amount}${price.livemode ? ' (live)' : ' (test mode)'}`;
	});
}

export function probeResend(): Promise<ProbeResult> {
	return probe('resend', Boolean(RESEND_API_KEY), async () => {
		const resend = new Resend(RESEND_API_KEY);
		const { data, error } = await resend.domains.list();
		if (error) throw new Error(error.message);
		const domains = data?.data ?? [];
		const verified = domains.filter((d) => d.status === 'verified').map((d) => d.name);
		return verified.length > 0
			? `API reachable · verified: ${verified.join(', ')}`
			: `API reachable · no verified sending domain (${domains.length} configured)`;
	});
}

export function probeWhatsAppCloud(): Promise<ProbeResult> {
	const configured = Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
	return probe('whatsapp-cloud', configured, async (signal) => {
		const res = await fetch(
			`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,quality_rating,verified_name`,
			{ headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }, signal },
		);
		if (!res.ok) throw new Error(`Graph API ${res.status}: ${(await res.text()).slice(0, 120)}`);
		const body = await res.json() as { display_phone_number?: string; quality_rating?: string; verified_name?: string };
		return `${body.verified_name ?? ''} ${body.display_phone_number ?? ''} · quality ${body.quality_rating ?? 'unknown'}`.trim();
	});
}
