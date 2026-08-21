import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { restaurants, whatsappContacts } from './schema';
import { claimIdempotencyKey, WHATSAPP_SCOPE } from './idempotency';
import { getStorage } from './storage';
import { downloadWhatsAppMedia, sendWhatsAppMessage } from './whatsapp';
import { checkRateLimit } from './rate-limiter';
import { normalizeCode, redeemPairingCode } from './whatsapp-pairing';
import { createBatch, getItem, getBatchItems, markQueued } from './batch';
import { enqueueBatchExtraction } from './extract-batch';
import { enqueueExtraction } from './queue';
import { APP_BASE_URL } from './env';

const UNAUTHORIZED_REPLY_COOLDOWN_S = 6 * 60 * 60;

export interface WhatsAppInboundMessage {
	from: string;
	id: string;
	type: string;
	timestamp?: string;
	text?: { body: string };
	image?: { id: string; mime_type?: string };
	document?: { id: string; mime_type?: string; filename?: string };
}

async function claimMessageId(messageId: string | undefined): Promise<boolean> {
	if (!messageId) return true;
	try {
		return await claimIdempotencyKey(WHATSAPP_SCOPE, messageId);
	} catch (err) {
		console.error('[whatsapp-bot] message-id claim failed (processing anyway):', err);
		return true;
	}
}

async function resolveRestaurantId(from: string): Promise<string | null> {
	// tenant-scope-ok: this IS the tenant resolution step — the sender's number
	// is globally unique across contacts and determines which restaurant they
	// belong to. There is no tenant context to scope by until this query returns.
	const rows = await db
		.select({ restaurantId: whatsappContacts.restaurantId })
		.from(whatsappContacts)
		.where(eq(whatsappContacts.phoneNumber, from))
		.limit(1);
	return rows[0]?.restaurantId ?? null;
}

async function handleUnknownSender(msg: WhatsAppInboundMessage, from: string): Promise<void> {
	if (msg.type === 'text' && msg.text && normalizeCode(msg.text.body)) {
		await handlePairingAttempt(from, msg.text.body);
		return;
	}
	if (await checkRateLimit(`whatsapp-unauth:${from}`, 1, UNAUTHORIZED_REPLY_COOLDOWN_S)) {
		await sendWhatsAppMessage(
			from,
			'❌ Este número no está autorizado. Contacta con el administrador para registrarte.',
		);
	}
}

async function dispatchMedia(msg: WhatsAppInboundMessage, from: string, restaurantId: string): Promise<void> {
	if (msg.type === 'image' && msg.image) {
		await handleMediaUpload(from, restaurantId, msg.image.id);
	} else if (msg.type === 'document' && msg.document) {
		await handleMediaUpload(from, restaurantId, msg.document.id);
	} else {
		await sendWhatsAppMessage(
			from,
			'⚠️ Solo puedo procesar imágenes (JPG, PNG) o documentos PDF de facturas.',
		);
	}
}

export async function handleWhatsAppMessage(msg: WhatsAppInboundMessage): Promise<void> {
	if (!(await claimMessageId(msg.id))) {
		console.info(`[whatsapp-bot] duplicate message ${msg.id} — skipping`);
		return;
	}
	const restaurantId = await resolveRestaurantId(msg.from);
	if (!restaurantId) {
		await handleUnknownSender(msg, msg.from);
		return;
	}
	await dispatchMedia(msg, msg.from, restaurantId);
}

async function handlePairingAttempt(from: string, body: string): Promise<void> {
	const result = await redeemPairingCode(from, body);

	if (result.ok) {
		const [restaurant] = await db
			.select({ name: restaurants.name })
			.from(restaurants)
			.where(eq(restaurants.id, result.restaurantId))
			.limit(1);
		await sendWhatsAppMessage(
			from,
			`✅ Número autorizado${restaurant?.name ? ` para *${restaurant.name}*` : ''}.\nYa puedes enviarme fotos o PDF de tus facturas.`,
		);
		return;
	}

	if (result.reason === 'rateLimited') return;

	if (result.reason === 'taken') {
		await sendWhatsAppMessage(
			from,
			'⚠️ Este número ya está autorizado en otro local. Pide al administrador que lo dé de baja antes de registrarlo aquí.',
		);
		return;
	}

	await sendWhatsAppMessage(from, '❌ Ese código no es válido o ha caducado. Pide uno nuevo al administrador.');
}

async function handleMediaUpload(
	from: string,
	restaurantId: string,
	mediaId: string,
): Promise<void> {
	let buffer: Buffer;
	let extension: string;
	try {
		({ buffer, extension } = await downloadWhatsAppMedia(mediaId));
	} catch (err) {
		console.error('[whatsapp-bot] media download error:', err);
		await sendWhatsAppMessage(from, '❌ No he podido descargar el archivo. Inténtalo de nuevo.');
		return;
	}

	const fileKey = `whatsapp/${restaurantId}/${randomUUID()}.${extension}`;
	try {
		await getStorage().save(fileKey, buffer);
	} catch (err) {
		console.error('[whatsapp-bot] storage error:', err);
		await sendWhatsAppMessage(from, '❌ No he podido guardar el archivo. Inténtalo de nuevo.');
		return;
	}

	const displayName = `WhatsApp_${new Date().toISOString().slice(0, 10)}.${extension}`;
	const { batchId, itemIds } = await createBatch(restaurantId, [{ key: fileKey, name: displayName }]);

	await enqueueBatchExtraction(itemIds[0], restaurantId, {
		getItem,
		getBatchItems,
		markQueued,
		enqueue: enqueueExtraction,
	});

	const link = APP_BASE_URL ? `${APP_BASE_URL}/batch/${batchId}` : `/batch/${batchId}`;
	await sendWhatsAppMessage(
		from,
		`📄 Factura recibida.\nRevísala y confírmala en el panel web:\n${link}`,
	);
}
