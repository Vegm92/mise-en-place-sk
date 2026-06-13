/**
 * WhatsApp Cloud API webhook.
 * GET  — Meta verify-token challenge (set WHATSAPP_VERIFY_TOKEN in env).
 * POST — Incoming messages from WhatsApp Business.
 *
 * Configure the webhook URL in Meta Developer Console:
 *   https://developers.facebook.com/apps → WhatsApp → Configuration → Webhook
 *   URL: https://your-domain.com/api/whatsapp/webhook
 *   Verify token: value of WHATSAPP_VERIFY_TOKEN
 *   Subscribed fields: messages
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { WHATSAPP_VERIFY_TOKEN } from '$lib/server/env';
import {
	handleWhatsAppMessage,
	type WhatsAppInboundMessage,
} from '$lib/server/whatsapp-bot';

/** Meta calls GET to verify the webhook endpoint during setup. */
export const GET: RequestHandler = async ({ url }) => {
	const mode      = url.searchParams.get('hub.mode');
	const token     = url.searchParams.get('hub.verify_token');
	const challenge = url.searchParams.get('hub.challenge');

	if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
		return new Response(challenge ?? '', { status: 200 });
	}
	return new Response('Forbidden', { status: 403 });
};

/** WhatsApp delivers message events here. We return 200 immediately. */
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}

	// Process asynchronously — WhatsApp expects a 200 within 5 s
	for (const msg of extractMessages(body)) {
		handleWhatsAppMessage(msg).catch(err =>
			console.error('[whatsapp-webhook] unhandled error:', err),
		);
	}

	return json({ ok: true });
};

function extractMessages(body: unknown): WhatsAppInboundMessage[] {
	const out: WhatsAppInboundMessage[] = [];
	const entry = (body as Record<string, unknown>)?.entry;
	if (!Array.isArray(entry)) return out;

	for (const e of entry) {
		const changes = (e as Record<string, unknown>)?.changes;
		if (!Array.isArray(changes)) continue;
		for (const c of changes) {
			const value = (c as Record<string, unknown>)?.value as
				| Record<string, unknown>
				| undefined;
			const msgs = value?.messages;
			if (!Array.isArray(msgs)) continue;
			for (const m of msgs) out.push(m as WhatsAppInboundMessage);
		}
	}
	return out;
}
