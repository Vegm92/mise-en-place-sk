import { maskPhoneNumber } from '$lib/phone';
import { WHATSAPP_ACCESS_TOKEN, WHATSAPP_API_VERSION, WHATSAPP_PHONE_NUMBER_ID } from './env';

const GRAPH_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
	if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
		console.warn('[whatsapp] Missing credentials — skipping message send to', maskPhoneNumber(to));
		return;
	}
	const res = await fetch(`${GRAPH_API_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
		},
		body: JSON.stringify({
			messaging_product: 'whatsapp',
			to,
			type: 'text',
			text: { body },
		}),
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`WhatsApp send failed (${res.status}): ${err}`);
	}
}
