import { randomUUID } from 'node:crypto';
import { createBatch, getItem, getBatchItems, markQueued } from '../../batch';
import { enqueueBatchExtraction } from '../../extract-batch';
import { enqueueExtraction } from '../../queue';
import { getStorage } from '../../storage';
import {
	MAX_FILE_BYTES,
	MediaTooLargeError,
	validateBuffer,
	type RejectReason,
} from '../../file-validation';
import { generateJobCode } from './jobs';
import type { WhatsAppMediaRef, WhatsAppMessageContext } from './transport';

export interface CommitFlag {
	value: boolean;
}

const REJECT_REPLY: Record<RejectReason, string> = {
	unsupportedType: '❌ Ese tipo de archivo no me sirve. Envíame una foto (JPG, PNG) o un PDF de la factura.',
	tooLarge: `❌ El archivo es demasiado grande (máx. ${MAX_FILE_BYTES / (1024 * 1024)} MB).`,
	contentMismatch: '❌ El archivo parece dañado o no es lo que dice ser. Vuelve a enviarlo.',
};

export async function handleMediaUpload(
	from: string,
	restaurantId: string,
	ref: WhatsAppMediaRef,
	ctx: WhatsAppMessageContext,
	committed: CommitFlag,
): Promise<void> {
	if (ref.file_length && ref.file_length > MAX_FILE_BYTES) {
		await ctx.sendText(from, REJECT_REPLY.tooLarge);
		return;
	}

	let buffer: Buffer;
	let extension: string;
	try {
		({ buffer, extension } = await ctx.downloadMedia(ref));
	} catch (err) {
		if (err instanceof MediaTooLargeError) {
			await ctx.sendText(from, REJECT_REPLY.tooLarge);
			return;
		}
		console.error('[whatsapp-bot] media download error:', err);
		await ctx.sendText(from, '❌ No he podido descargar el archivo. Inténtalo de nuevo.');
		throw err;
	}

	const rejection = validateBuffer(buffer, `.${extension}`);
	if (rejection) {
		await ctx.sendText(from, REJECT_REPLY[rejection]);
		return;
	}

	const fileKey = `whatsapp/${restaurantId}/${randomUUID()}.${extension}`;
	try {
		await getStorage().save(fileKey, buffer);
	} catch (err) {
		console.error('[whatsapp-bot] storage error:', err);
		await ctx.sendText(from, '❌ No he podido guardar el archivo. Inténtalo de nuevo.');
		throw err;
	}

	const displayName = `WhatsApp_${new Date().toISOString().slice(0, 10)}.${extension}`;
	const { itemIds } = await createBatch(
		restaurantId,
		[{ key: fileKey, name: displayName }],
		{ source: 'whatsapp', sourceRef: from, jobCode: await generateJobCode() },
	);

	await enqueueBatchExtraction(itemIds[0], restaurantId, {
		getItem,
		getBatchItems,
		markQueued,
		enqueue: enqueueExtraction,
	});
	committed.value = true;

	await ctx.sendText(from, '📄 Factura recibida.\nEstoy leyéndola, te aviso en un momento.');
}
