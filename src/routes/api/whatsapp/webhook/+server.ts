import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET } from '$lib/server/env';
import {
	handleWhatsAppMessage,
	type WhatsAppInboundMessage,
} from '$lib/server/whatsapp-bot';
import { recordAccountEvent, type AccountEventInput } from '$lib/server/whatsapp-health';

const NODE_ENV = process.env.NODE_ENV ?? 'development';

function verifySignature(rawBody: string, header: string | null): boolean {
	if (!WHATSAPP_APP_SECRET) {
		if (NODE_ENV === 'production') {
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

export const GET: RequestHandler = async ({ url }) => {
	const mode      = url.searchParams.get('hub.mode');
	const token     = url.searchParams.get('hub.verify_token');
	const challenge = url.searchParams.get('hub.challenge');

	if (mode === 'subscribe' && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN) {
		return new Response(challenge ?? '', { status: 200 });
	}
	return new Response('Forbidden', { status: 403 });
};

export const POST: RequestHandler = async ({ request }) => {
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

	for (const msg of messages) {
		handleWhatsAppMessage(msg).catch(err =>
			console.error('[whatsapp-webhook] unhandled error:', err),
		);
	}

	for (const evt of accountEvents) {
		recordAccountEvent(evt).catch(err =>
			console.error('[whatsapp-webhook] account event error:', err),
		);
	}

	return json({ ok: true });
};

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

			if (Array.isArray(value.statuses)) continue;

			const field = typeof change.field === 'string' ? change.field : 'unknown';
			accountEvents.push({ field, value });
		}
	}
	return { messages, accountEvents };
}
