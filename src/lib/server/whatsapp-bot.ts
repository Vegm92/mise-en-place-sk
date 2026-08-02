import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/sveltekit';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { forTenant } from './db';
import { sql } from 'drizzle-orm';
import { db } from './db';
import {
	invoiceLineItems,
	invoices,
	restaurants,
	whatsappBotSessions,
	whatsappContacts,
	whatsappProcessedMessages,
} from './schema';
import { computeInvoiceContentHash } from './dedup';
import { getOrCreateSupplierId } from './supplier';
import { resolveSupplierCategory, UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { extractWithProvider, type ExtractedInvoice } from './extract';
import { getStorage } from './storage';
import { downloadWhatsAppMedia, sendWhatsAppMessage } from './whatsapp';
import { maybeSendQuotaWarning } from './quota-warning';
import { claimMonthlyExtraction, releaseMonthlyExtraction } from './llm-quota';
import { checkRateLimit } from './rate-limiter';
import { normalizeCode, redeemPairingCode } from './whatsapp-pairing';
import { createBatch, getItem, getBatchItems, markQueued } from './batch';
import { enqueueBatchExtraction } from './extract-batch';
import { enqueueExtraction } from './queue';
import { WHATSAPP_USE_BATCH_PIPELINE, APP_BASE_URL } from './env';

const SESSION_TTL_MS = 60 * 60 * 1000;

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
		const rows = await db
			.insert(whatsappProcessedMessages)
			.values({ messageId })
			.onConflictDoNothing()
			.returning({ messageId: whatsappProcessedMessages.messageId });
		return rows.length > 0;
	} catch (err) {
		console.error('[whatsapp-bot] message-id claim failed (processing anyway):', err);
		return true;
	}
}

export async function handleWhatsAppMessage(msg: WhatsAppInboundMessage): Promise<void> {
	if (!(await claimMessageId(msg.id))) {
		console.info(`[whatsapp-bot] duplicate message ${msg.id} — skipping`);
		return;
	}

	const from = msg.from;

	const contactRows = await db
		.select({ restaurantId: whatsappContacts.restaurantId })
		.from(whatsappContacts)
		.where(eq(whatsappContacts.phoneNumber, from))
		.limit(1);

	if (contactRows.length === 0) {
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
		return;
	}

	const restaurantId = contactRows[0].restaurantId;

	if (msg.type === 'text' && msg.text) {
		await handleTextReply(from, restaurantId, msg.text.body);
	} else if (msg.type === 'image' && msg.image) {
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
	const existingSession = await getPendingSession(from);
	if (existingSession) {
		await sendWhatsAppMessage(
			from,
			'⏳ Tienes una factura pendiente de confirmación.\nResponde *SÍ* para guardar o *NO* para cancelar antes de enviar otra.',
		);
		return;
	}

	if (WHATSAPP_USE_BATCH_PIPELINE) {
		await handleMediaUploadBatch(from, restaurantId, mediaId);
		return;
	}

	const claim = await claimMonthlyExtraction(restaurantId);
	if (!claim.claimed) {
		console.warn(`[whatsapp-bot] monthly plan quota reached for tenant ${restaurantId} (limit ${claim.limit})`);
		Sentry.captureMessage('extraction.quota_exhausted', {
			level: 'warning',
			tags: { restaurantId, source: 'whatsapp' },
		});
		await sendWhatsAppMessage(
			from,
			`⚠️ Has alcanzado el límite de facturas de tu plan este mes (${claim.limit}).\nAmplía tu plan en el panel web para seguir enviando facturas.`,
		);
		return;
	}

	let buffer: Buffer;
	let extension: string;
	try {
		({ buffer, extension } = await downloadWhatsAppMedia(mediaId));
	} catch (err) {
		console.error('[whatsapp-bot] media download error:', err);
		await releaseMonthlyExtraction(restaurantId);
		await sendWhatsAppMessage(from, '❌ No he podido descargar el archivo. Inténtalo de nuevo.');
		return;
	}

	const tmpFile = path.join(os.tmpdir(), `wa_${randomUUID()}.${extension}`);
	fs.writeFileSync(tmpFile, buffer);

	let extracted: ExtractedInvoice;
	try {
		const result = await extractWithProvider(tmpFile);
		extracted = result.invoice;
	} catch (err) {
		console.error('[whatsapp-bot] extraction error:', err);
		await releaseMonthlyExtraction(restaurantId);
		await sendWhatsAppMessage(
			from,
			'❌ No he podido leer la factura. Asegúrate de que la imagen sea clara e inténtalo de nuevo.',
		);
		return;
	} finally {
		try { fs.unlinkSync(tmpFile); } catch { }
	}

	const fileKey = `whatsapp/${restaurantId}/${randomUUID()}.${extension}`;
	try {
		await getStorage().save(fileKey, buffer);
	} catch (err) {
		console.error('[whatsapp-bot] storage error (non-fatal):', err);
	}

	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await db.insert(whatsappBotSessions).values({
		restaurantId,
		fromNumber: from,
		extractedData: extracted as unknown as Record<string, unknown>,
		fileKey,
		status: 'awaiting_confirmation',
		expiresAt,
	});

	await sendWhatsAppMessage(from, buildSummaryMessage(extracted));
}

async function handleMediaUploadBatch(
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

async function handleTextReply(from: string, restaurantId: string, body: string): Promise<void> {
	const normalized = body
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');

	const isYes = ['si', 's', 'yes', 'y', '1', 'confirmar', 'confirmo', 'ok'].includes(normalized);
	const isNo  = ['no', 'n', '0', 'cancelar', 'cancel'].includes(normalized);

	const session = await getPendingSession(from);

	if (!isYes && !isNo) {
		if (session) {
			await sendWhatsAppMessage(
				from,
				'Por favor, responde *SÍ* para guardar la factura o *NO* para cancelar.',
			);
		}
		return;
	}

	if (!session) {
		await sendWhatsAppMessage(
			from,
			'No hay ninguna factura pendiente. Envía una imagen o PDF para procesarla.',
		);
		return;
	}

	if (isNo) {
		await db
			.update(whatsappBotSessions)
			.set({ status: 'discarded' })
			.where(eq(whatsappBotSessions.id, session.id));
		await sendWhatsAppMessage(from, '❌ Factura descartada. Puedes enviar otra en cualquier momento.');
		return;
	}

	const claim = await db
		.update(whatsappBotSessions)
		.set({ status: 'confirmed' })
		.where(and(
			eq(whatsappBotSessions.id, session.id),
			eq(whatsappBotSessions.status, 'awaiting_confirmation'),
		))
		.returning({ id: whatsappBotSessions.id });
	if (claim.length === 0) {
		return;
	}

	const extracted = session.extractedData as unknown as ExtractedInvoice;
	const result = await saveWhatsAppInvoice(restaurantId, extracted, session.fileKey);

	if (result.type !== 'saved') {
		await db
			.update(whatsappBotSessions)
			.set({ status: 'discarded' })
			.where(eq(whatsappBotSessions.id, session.id));
	}

	if (result.type === 'saved') {
		await sendWhatsAppMessage(
			from,
			`✅ Factura guardada correctamente (ID #${result.invoiceId}).\nPuedes revisarla y confirmar el pago en el panel web.`,
		);
	} else if (result.type === 'duplicate') {
		await sendWhatsAppMessage(from, '⚠️ Esta factura ya existe en el sistema. No se ha guardado de nuevo.');
	} else {
		await sendWhatsAppMessage(from, '❌ Error al guardar la factura. Por favor, inténtalo de nuevo.');
	}
}

async function getPendingSession(from: string) {
	const rows = await db
		.select()
		.from(whatsappBotSessions)
		.where(
			and(
				eq(whatsappBotSessions.fromNumber, from),
				eq(whatsappBotSessions.status, 'awaiting_confirmation'),
				gt(whatsappBotSessions.expiresAt, sql`now()`),
			),
		)
		.orderBy(desc(whatsappBotSessions.createdAt))
		.limit(1);
	return rows[0] ?? null;
}

type SaveResult =
	| { type: 'saved'; invoiceId: number }
	| { type: 'duplicate' }
	| { type: 'error' };

async function saveWhatsAppInvoice(
	restaurantId: string,
	data: ExtractedInvoice,
	fileKey: string | null | undefined,
): Promise<SaveResult> {
	const tdb = forTenant(restaurantId);
	const supplierName  = data.supplier_name?.trim()  || 'Desconocido';
	const invoiceNumber = data.invoice_number?.trim() ?? '';
	const invoiceDate   = data.invoice_date  ?? null;
	const dueDate       = data.due_date      ?? null;
	const totalAmount   = data.total_amount  ?? null;
	const lineItems     = data.line_items    ?? [];

	const contentHash = computeInvoiceContentHash({
		supplierName,
		invoiceNumber,
		invoiceDate,
		dueDate,
		totalAmount,
		lineDescriptions: lineItems.map(li => li.description ?? ''),
		lineQuantities:   lineItems.map(li => li.quantity ?? null),
		lineUnits:        lineItems.map(li => li.unit ?? null),
		lineUnitPrices:   lineItems.map(li => li.unit_price ?? null),
		lineTotalPrices:  lineItems.map(li => li.total_price ?? null),
	});

	const hashMatch = await db
		.select({ id: invoices.id })
		.from(invoices)
		.where(
			and(
				tdb.scope(invoices.restaurantId),
				eq(invoices.contentHash, contentHash),
				isNull(invoices.deletedAt),
			),
		)
		.limit(1);

	if (hashMatch.length > 0) return { type: 'duplicate' };

	let invoiceId: number | null = null;

	try {
		await db.transaction(async (tx) => {
			const supplierId = await getOrCreateSupplierId(
				restaurantId,
				supplierName,
				tx,
				data.supplier_name?.trim()
					? resolveSupplierCategory(data.supplier_category, data.field_confidences?.supplier_category)
					: UNCATEGORIZED_CATEGORY,
			);

			if (invoiceNumber) {
				const dup = await tx
					.select({ id: invoices.id })
					.from(invoices)
					.where(
						and(
							tdb.scope(invoices.restaurantId),
							eq(invoices.supplierId, supplierId),
							eq(invoices.invoiceNumber, invoiceNumber),
						),
					)
					.limit(1);
				if (dup.length > 0) {
					invoiceId = -1;
					return;
				}
			}

			const ins = await tx
				.insert(invoices)
				.values({
					restaurantId,
					supplierId,
					invoiceNumber: invoiceNumber || null,
					invoiceDate,
					dueDate,
					totalAmount,
					taxBase: data.tax_base ?? null,
					taxBreakdown: data.tax_breakdown ? JSON.stringify(data.tax_breakdown) : null,
					status: 'pending',
					sourceFile: fileKey ?? null,
					confidence: data.confidence,
					contentHash,
					notes: '📱 Recibida por WhatsApp',
				})
				.onConflictDoNothing()
				.returning({ id: invoices.id });

			if (!ins.length) {
				invoiceId = -1;
				return;
			}
			invoiceId = ins[0].id;

			for (const li of lineItems) {
				if (!li.description?.trim()) continue;
				await tx.insert(invoiceLineItems).values({
					invoiceId: invoiceId!,
					restaurantId,
					description: li.description,
					quantity:    li.quantity    ?? null,
					unit:        li.unit        ?? null,
					unitPrice:   li.unit_price  ?? null,
					totalPrice:  li.total_price ?? null,
					taxRate:     null,
					requiresUnitConversion: 0,
					canonicalUnit: null,
				});
			}
		});
	} catch (err) {
		console.error('[whatsapp-bot] save error:', err);
		return { type: 'error' };
	}

	if (invoiceId === -1 || invoiceId === null) return { type: 'duplicate' };

	void maybeSendQuotaWarning(restaurantId);

	return { type: 'saved', invoiceId };
}

function buildSummaryMessage(data: ExtractedInvoice): string {
	const parts: string[] = ['📄 *He procesado esta factura*\n'];

	if (data.supplier_name)    parts.push(`🏪 *Proveedor:* ${data.supplier_name}`);
	if (data.invoice_number)   parts.push(`📋 *N.º factura:* ${data.invoice_number}`);
	if (data.invoice_date)     parts.push(`📅 *Fecha:* ${formatDate(data.invoice_date)}`);
	if (data.total_amount != null) parts.push(`💶 *Total:* ${formatEur(data.total_amount)}`);

	const validLines = (data.line_items ?? []).filter(li => li.description?.trim());
	if (validLines.length > 0) {
		parts.push('\n*Artículos:*');
		for (const li of validLines.slice(0, 5)) {
			const qty   = li.quantity != null ? `${li.quantity}${li.unit ? ' ' + li.unit : ''}` : '';
			const price = li.total_price != null ? ` — ${formatEur(li.total_price)}` : '';
			parts.push(`• ${qty ? qty + ' · ' : ''}${li.description}${price}`);
		}
		if (validLines.length > 5) {
			parts.push(`  _(y ${validLines.length - 5} artículo(s) más)_`);
		}
	}

	const confPct = data.confidence != null ? Math.round(data.confidence * 100) : null;
	if (confPct != null) parts.push(`\n🔍 *Confianza:* ${confPct}%`);

	parts.push('\n¿Confirmas esta factura?\nResponde *SÍ* para guardar o *NO* para cancelar.');
	return parts.join('\n');
}

function formatDate(iso: string): string {
	const [y, m, d] = iso.split('-');
	return d && m && y ? `${d}/${m}/${y}` : iso;
}

function formatEur(n: number): string {
	return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}
