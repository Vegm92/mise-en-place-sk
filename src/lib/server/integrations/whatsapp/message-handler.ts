import { eq } from 'drizzle-orm';
import { db, runAsSystem, runWithTenantContext } from '../../db';
import { restaurants, whatsappContacts } from '../../schema';
import { claimIdempotencyKey, releaseIdempotencyKey, WHATSAPP_SCOPE } from '../../idempotency';
import { checkRateLimit } from '../../rate-limiter';
import { getAccessState } from '../../billing';
import { isLocationLocked } from '../../locations';
import { normalizeCode, redeemPairingCode } from '../../whatsapp-pairing';
import { WHATSAPP_SENDER_HOURLY_LIMIT } from '../../env';
import { handleMediaUpload, type CommitFlag } from './media-handler';
import {
	batchLink, findJobByCode, parseReview, pendingJobsFor, raiseReviewNotification,
	setReviewStatus, supplierOf, type WhatsAppJob,
} from './jobs';
import type { WhatsAppInboundMessage, WhatsAppMessageContext } from './transport';

const UNAUTHORIZED_REPLY_COOLDOWN_S = 6 * 60 * 60;
const SENDER_WINDOW_S = 60 * 60;

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
	return runAsSystem(async () => {
		// tenant-scope-ok: this IS the tenant resolution step — the sender's number
		// is globally unique across contacts and determines which restaurant they
		// belong to. There is no tenant context to scope by until this query returns.
		const rows = await db
			.select({ restaurantId: whatsappContacts.restaurantId })
			.from(whatsappContacts)
			.where(eq(whatsappContacts.phoneNumber, from))
			.limit(1);
		return rows[0]?.restaurantId ?? null;
	});
}

async function handleUnknownSender(
	msg: WhatsAppInboundMessage,
	from: string,
	ctx: WhatsAppMessageContext,
): Promise<void> {
	if (msg.type === 'text' && msg.text && normalizeCode(msg.text.body)) {
		await handlePairingAttempt(from, msg.text.body, ctx);
		return;
	}
	if (await checkRateLimit(`whatsapp-unauth:${from}`, 1, UNAUTHORIZED_REPLY_COOLDOWN_S)) {
		await ctx.sendText(
			from,
			'❌ Este número no está autorizado. Contacta con el administrador para registrarte.',
		);
	}
}

async function handlePairingAttempt(
	from: string,
	body: string,
	ctx: WhatsAppMessageContext,
): Promise<void> {
	const result = await redeemPairingCode(from, body);

	if (result.ok) {
		const [restaurant] = await runAsSystem(() => db
			.select({ name: restaurants.name })
			.from(restaurants)
			.where(eq(restaurants.id, result.restaurantId))
			.limit(1));
		const restaurantSuffix = restaurant?.name ? ` para *${restaurant.name}*` : '';
		await ctx.sendText(
			from,
			`✅ Número autorizado${restaurantSuffix}.\nYa puedes enviarme fotos o PDF de tus facturas.`,
		);
		return;
	}

	if (result.reason === 'rateLimited') return;

	if (result.reason === 'taken') {
		await ctx.sendText(
			from,
			'⚠️ No se ha podido vincular este número. Comprueba el número o contacta con soporte.',
		);
		return;
	}

	await ctx.sendText(from, '❌ Ese código no es válido o ha caducado. Pide uno nuevo al administrador.');
}

async function resolveJob(
	from: string,
	code: string | null,
	ctx: WhatsAppMessageContext,
): Promise<WhatsAppJob | null> {
	if (code) {
		const byCode = await findJobByCode(from, code);
		if (byCode) return byCode;
		await ctx.sendText(from, `⚠️ No tengo ninguna factura con el código ${code} esperando confirmación.`);
		return null;
	}

	const pending = await pendingJobsFor(from);
	if (pending.length === 1) return pending[0]!;
	if (pending.length === 0) {
		await ctx.sendText(from, 'No tengo ninguna factura esperando confirmación.');
		return null;
	}
	await ctx.sendText(
		from,
		'Tengo varias facturas pendientes. Responde con el código:\n' +
			pending.map((p) => `${p.jobCode} — ${supplierOf(p)}`).join('\n'),
	);
	return null;
}

async function handleTextReply(
	from: string,
	body: string,
	ctx: WhatsAppMessageContext,
): Promise<void> {
	const parsed = parseReview(body);
	if (!parsed) {
		await ctx.sendText(
			from,
			'⚠️ Envíame una foto o PDF de la factura, o responde OK / NO al resumen.',
		);
		return;
	}

	const job = await resolveJob(from, parsed.code, ctx);
	if (!job) return;

	if (!(await setReviewStatus(job.id, parsed.decision, ['pending']))) {
		await ctx.sendText(from, 'Esa factura ya estaba revisada.');
		return;
	}

	await raiseReviewNotification(job, parsed.decision);
	await ctx.sendText(
		from,
		parsed.decision === 'reviewed'
			? `✅ Factura marcada como revisada.\nGuárdala en el panel cuando puedas:\n${batchLink(job.batchId)}`
			: `⚠️ Factura marcada como "To Review".\nRevísala en el panel:\n${batchLink(job.batchId)}`,
	);
}

async function dispatchMessage(
	msg: WhatsAppInboundMessage,
	from: string,
	restaurantId: string,
	ctx: WhatsAppMessageContext,
	committed: CommitFlag,
): Promise<void> {
	if (msg.type === 'image' && msg.image) {
		await handleMediaUpload(from, restaurantId, msg.image, ctx, committed);
	} else if (msg.type === 'document' && msg.document) {
		await handleMediaUpload(from, restaurantId, msg.document, ctx, committed);
	} else if (msg.type === 'text' && msg.text) {
		await handleTextReply(from, msg.text.body, ctx);
	} else {
		await ctx.sendText(
			from,
			'⚠️ Solo puedo procesar imágenes (JPG, PNG) o documentos PDF de facturas.',
		);
	}
}

async function routeMessage(
	msg: WhatsAppInboundMessage,
	ctx: WhatsAppMessageContext,
	committed: CommitFlag,
): Promise<void> {
	const restaurantId = await resolveRestaurantId(msg.from);
	if (!restaurantId) {
		await handleUnknownSender(msg, msg.from, ctx);
		return;
	}
	await runWithTenantContext(restaurantId, async () => {
		if (msg.type === 'image' || msg.type === 'document') {
			if (!(await checkRateLimit(`whatsapp:${msg.from}`, WHATSAPP_SENDER_HOURLY_LIMIT, SENDER_WINDOW_S))) {
				await ctx.sendText(
					msg.from,
					'⏳ Has enviado demasiadas facturas seguidas. Espera un momento e inténtalo de nuevo.',
				);
				return;
			}
			if (await isLocationLocked(restaurantId)) {
				await ctx.sendText(
					msg.from,
					'❌ Este local está fuera de tu plan actual. Vuelve al plan Business para volver a procesar sus albaranes.',
				);
				return;
			}
			const access = await getAccessState(restaurantId);
			if (!access.allowed) {
				await ctx.sendText(
					msg.from,
					access.trialExpired
						? '❌ Tu prueba gratuita ha terminado. Activa una suscripción para volver a procesar facturas.'
						: '❌ Tu suscripción no está activa. Reactívala para volver a procesar facturas.',
				);
				return;
			}
		}
		await dispatchMessage(msg, msg.from, restaurantId, ctx, committed);
	});
}

export async function handleInboundMessage(
	msg: WhatsAppInboundMessage,
	ctx: WhatsAppMessageContext,
): Promise<void> {
	if (!(await claimMessageId(msg.id))) {
		console.info(`[whatsapp-bot] duplicate message ${msg.id} — skipping`);
		return;
	}

	const committed: CommitFlag = { value: false };
	try {
		await routeMessage(msg, ctx, committed);
	} catch (err) {
		if (!committed.value && msg.id) {
			await releaseIdempotencyKey(WHATSAPP_SCOPE, msg.id)
				.catch((e) => console.error('[whatsapp-bot] failed to release claim:', e));
		}
		throw err;
	}
}
