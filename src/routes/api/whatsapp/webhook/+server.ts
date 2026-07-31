/**
 * WhatsApp Cloud API webhook.
 * GET  — Meta verify-token challenge (set WHATSAPP_VERIFY_TOKEN in env).
 * POST — Incoming messages from WhatsApp Business.
 *
 * Configure the webhook URL in Meta Developer Console:
 *   https://developers.facebook.com/apps → WhatsApp → Configuration → Webhook
 *   URL: https://your-domain.com/api/whatsapp/webhook
 *   Verify token: value of WHATSAPP_VERIFY_TOKEN
 *   Subscribed fields: messages, account_update, phone_number_quality_update
 *
 * The account fields are what turn a shared-number quality downgrade from
 * something discovered via support tickets into something delivered (#321).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET } from '$lib/server/env';
import {
	handleWhatsAppMessage,
	type WhatsAppInboundMessage,
} from '$lib/server/whatsapp-bot';
import { recordAccountEvent, type AccountEventInput } from '$lib/server/whatsapp-health';

/**
 * Verify Meta's X-Hub-Signature-256 HMAC over the raw request body.
 * A configured secret with a bad/missing signature is rejected. A missing
 * secret is tolerated only outside production (dev / not-yet-set-up): in
 * production the webhook fails CLOSED, because an unauthenticated POST here
 * can impersonate a registered WhatsApp number and inject invoices into that
 * tenant (plus burn Gemini extraction quota).
 */
function verifySignature(rawBody: string, header: string | null): boolean {
	if (!WHATSAPP_APP_SECRET) {
		if (process.env['NODE_ENV'] === 'production') {
			console.error('[whatsapp-webhook] WHATSAPP_APP_SECRET not set — rejecting unauthenticated webhook POST');
			return false;
		}
		console.warn('[whatsapp-webhook] WHATSAPP_APP_SECRET not set — skipping signature verification (non-production only)');
		return true;
	}
	if (!header?.startsWith('sha256=')) return false;
	const expected = createHmac('sha256', WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
	const received = header.slice('sha256='.length);
	const a = Buffer.from(expected, 'hex');
	const b = Buffer.from(received, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Meta calls GET to verify the webhook endpoint during setup. */
export const GET: RequestHandler = async ({ url }) => {
	const mode      = url.searchParams.get('hub.mode');
	const token     = url.searchParams.get('hub.verify_token');
	const challenge = url.searchParams.get('hub.challenge');

	if (mode === 'subscribe' && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN) {
		return new Response(challenge ?? '', { status: 200 });
	}
	return new Response('Forbidden', { status: 403 });
};

/** WhatsApp delivers message events here. We return 200 immediately. */
export const POST: RequestHandler = async ({ request }) => {
	// Read the raw body first — HMAC must be computed over the exact bytes Meta sent.
	const rawBody = await request.text();

	if (!verifySignature(rawBody, request.headers.get('x-hub-signature-256'))) {
		return json({ error: 'invalid signature' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}

	const { messages, accountEvents } = extractChanges(body);

	// Process asynchronously — WhatsApp expects a 200 within 5 s
	for (const msg of messages) {
		handleWhatsAppMessage(msg).catch(err =>
			console.error('[whatsapp-webhook] unhandled error:', err),
		);
	}

	// Account-level events (issue #321). Ingest for every tenant runs through one
	// shared number, so a quality downgrade or restriction has to be delivered
	// here rather than discovered from support tickets.
	for (const evt of accountEvents) {
		recordAccountEvent(evt).catch(err =>
			console.error('[whatsapp-webhook] account event error:', err),
		);
	}

	return json({ ok: true });
};

/**
 * Split a webhook payload into inbound messages and account-level events.
 *
 * Meta multiplexes every subscribed field through the same endpoint and
 * distinguishes them by `changes[].field`. Reading `value.messages` regardless
 * of the field (as this did) silently discarded everything that was not a
 * message — including the quality and restriction notices #321 exists to catch.
 */
function extractChanges(body: unknown): {
	messages: WhatsAppInboundMessage[];
	accountEvents: AccountEventInput[];
} {
	const messages: WhatsAppInboundMessage[] = [];
	const accountEvents: AccountEventInput[] = [];

	const entry = (body as Record<string, unknown>)?.entry;
	if (!Array.isArray(entry)) return { messages, accountEvents };

	for (const e of entry) {
		const changes = (e as Record<string, unknown>)?.changes;
		if (!Array.isArray(changes)) continue;
		for (const c of changes) {
			const change = c as Record<string, unknown>;
			const value = change?.value as Record<string, unknown> | undefined;
			if (!value) continue;

			const msgs = value.messages;
			if (Array.isArray(msgs)) {
				for (const m of msgs) messages.push(m as WhatsAppInboundMessage);
				continue;
			}

			// Statuses (sent/delivered/read receipts) are the other high-volume
			// field and carry no health signal — skip them rather than filling the
			// events table with noise.
			if (Array.isArray(value.statuses)) continue;

			const field = typeof change.field === 'string' ? change.field : 'unknown';
			// Anything else that is subscribed is health-relevant by definition:
			// we only subscribe to fields we intend to act on, and an unrecognised
			// event is better recorded than dropped.
			accountEvents.push({ field, value });
		}
	}
	return { messages, accountEvents };
}
