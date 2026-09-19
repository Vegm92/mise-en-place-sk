import { json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RESEND_WEBHOOK_SECRET } from '$lib/server/env';
import {
	fetchResendAttachment,
	ingestInboundEmail,
	type InboundEmailMessage,
} from '$lib/server/email-ingest';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const TOLERANCE_SECONDS = 5 * 60;

function verifySignature(body: string, id: string | null, timestamp: string | null, signature: string | null): boolean {
	if (!RESEND_WEBHOOK_SECRET) {
		if (NODE_ENV === 'production') {
			console.error('[email-ingest-webhook] RESEND_WEBHOOK_SECRET not set — rejecting unauthenticated webhook POST');
			return false;
		}
		console.warn('[email-ingest-webhook] RESEND_WEBHOOK_SECRET not set — skipping signature verification (non-production only)');
		return true;
	}
	if (!id || !timestamp || !signature) return false;
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

	const secretBytes = Buffer.from(RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest();

	return signature.split(' ').some((candidate) => {
		const sig = candidate.includes(',') ? candidate.split(',')[1] : candidate;
		if (!sig) return false;
		let given: Buffer;
		try {
			given = Buffer.from(sig, 'base64');
		} catch {
			return false;
		}
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}

interface RawAttachment {
	id?: unknown;
	filename?: unknown;
	content_type?: unknown;
	content_disposition?: unknown;
}

function parseEnvelope(body: unknown): InboundEmailMessage | null {
	const evt = body as { type?: unknown; data?: Record<string, unknown> };
	if (evt?.type !== 'email.received' || !evt.data) return null;

	const data = evt.data;
	const emailId = typeof data.email_id === 'string' ? data.email_id : '';
	const from = typeof data.from === 'string' ? data.from : '';
	const to = Array.isArray(data.to) ? data.to.filter((v): v is string => typeof v === 'string') : [];
	if (!emailId || !from || to.length === 0) return null;

	const rawAttachments = Array.isArray(data.attachments) ? (data.attachments as RawAttachment[]) : [];
	const attachments = rawAttachments
		.map(a => ({
			id: typeof a.id === 'string' ? a.id : '',
			filename: typeof a.filename === 'string' ? a.filename : null,
			contentType: typeof a.content_type === 'string' ? a.content_type : 'application/octet-stream',
			contentDisposition: typeof a.content_disposition === 'string' ? a.content_disposition : null,
		}))
		.filter(a => a.id);

	return { emailId, from, to, attachments };
}

const OUTCOME_STATUS: Record<string, number> = {
	'unknown-recipient': 404,
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.text();

	if (!verifySignature(body, request.headers.get('svix-id'), request.headers.get('svix-timestamp'), request.headers.get('svix-signature'))) {
		return json({ error: 'invalid signature' }, { status: 401 });
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}

	const msg = parseEnvelope(parsed);
	if (!msg) return json({ ok: true, ignored: true });

	try {
		const outcome = await ingestInboundEmail(msg, { fetchAttachment: fetchResendAttachment }, locals?.requestId);
		return json({ ok: outcome.kind === 'ingested', outcome: outcome.kind }, { status: OUTCOME_STATUS[outcome.kind] ?? 200 });
	} catch (err) {
		console.error('[email-ingest-webhook] handler error:', err);
		Sentry.captureException(err);
		return json({ error: 'handler error' }, { status: 500 });
	}
};
