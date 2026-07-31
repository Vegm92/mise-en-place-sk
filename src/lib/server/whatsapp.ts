import { WHATSAPP_ACCESS_TOKEN, WHATSAPP_API_VERSION, WHATSAPP_PHONE_NUMBER_ID } from './env';

const GRAPH_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

const MIME_TO_EXT: Record<string, string> = {
	'image/jpeg':    'jpg',
	'image/png':     'png',
	'application/pdf': 'pdf',
};

function maskPhone(to: string): string {
	return `***${to.slice(-4)}`;
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
	if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
		console.warn('[whatsapp] Missing credentials — skipping message send to', maskPhone(to));
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

export async function downloadWhatsAppMedia(
	mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
	if (!WHATSAPP_ACCESS_TOKEN) throw new Error('WHATSAPP_ACCESS_TOKEN is not set');

	const metaRes = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
		headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
	});
	if (!metaRes.ok) throw new Error(`WhatsApp media metadata failed (${metaRes.status})`);
	const meta = (await metaRes.json()) as { url: string; mime_type: string };

	const fileRes = await fetch(meta.url, {
		headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
	});
	if (!fileRes.ok) throw new Error(`WhatsApp media download failed (${fileRes.status})`);

	const buffer = Buffer.from(await fileRes.arrayBuffer());
	const mimeType = meta.mime_type;
	const extension = MIME_TO_EXT[mimeType] ?? 'jpg';

	return { buffer, mimeType, extension };
}
