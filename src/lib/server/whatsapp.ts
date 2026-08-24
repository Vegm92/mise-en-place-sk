import { WHATSAPP_ACCESS_TOKEN, WHATSAPP_API_VERSION, WHATSAPP_PHONE_NUMBER_ID } from './env';
import { MAX_FILE_BYTES } from './file-validation';

const GRAPH_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

const MIME_TO_EXT: Record<string, string> = {
	'image/jpeg':    'jpg',
	'image/png':     'png',
	'application/pdf': 'pdf',
	'application/xml': 'xml',
	'text/xml':        'xml',
};

export class MediaTooLargeError extends Error {
	readonly declaredSize: number;

	constructor(declaredSize: number) {
		super(`WhatsApp media is ${declaredSize} bytes, over the ${MAX_FILE_BYTES} byte limit`);
		this.name = 'MediaTooLargeError';
		this.declaredSize = declaredSize;
	}
}

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
	const meta = (await metaRes.json()) as { url: string; mime_type: string; file_size?: number };

	if (meta.file_size && meta.file_size > MAX_FILE_BYTES) throw new MediaTooLargeError(meta.file_size);

	const fileRes = await fetch(meta.url, {
		headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
	});
	if (!fileRes.ok) throw new Error(`WhatsApp media download failed (${fileRes.status})`);

	const declaredLength = Number(fileRes.headers.get('content-length') ?? 0);
	if (declaredLength > MAX_FILE_BYTES) throw new MediaTooLargeError(declaredLength);

	const buffer = Buffer.from(await fileRes.arrayBuffer());
	const mimeType = meta.mime_type;
	const extension = MIME_TO_EXT[mimeType] ?? 'jpg';

	return { buffer, mimeType, extension };
}
