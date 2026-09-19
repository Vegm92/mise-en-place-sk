import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, runAsSystem, runWithTenantContext } from './db';
import { restaurants } from './schema';
import { EMAIL_INGEST_DOMAIN, EMAIL_INGEST_ENABLED } from './env';
import { getEntitlements } from './billing';
import { rateLimitScoped } from './rate-limit-scope';
import { remainingMonthlyQuota } from './llm-quota';
import { saveUploadedFiles, type RejectedUpload } from './sessions';
import { createBatch, getItem, getBatchItems, markQueued } from './batch';
import { enqueueBatchExtraction } from './extract-batch';
import { enqueueExtraction } from './queue';
import { claimIdempotencyKey, releaseIdempotencyKey } from './idempotency';
import { sendEmail, emailIngestRejectedEmail, getResendClient } from './email';
import { MAX_FILE_BYTES, MediaTooLargeError } from './file-validation';

export const EMAIL_INGEST_SCOPE = 'email-ingest';

export function ingestAddress(token: string): string {
	return `${token}@${EMAIL_INGEST_DOMAIN}`;
}

export async function getIngestAddress(restaurantId: string): Promise<string | null> {
	if (!EMAIL_INGEST_DOMAIN) return null;
	const [row] = await db
		.select({ token: restaurants.emailIngestToken })
		.from(restaurants)
		.where(eq(restaurants.id, restaurantId))
		.limit(1);
	return row ? ingestAddress(row.token) : null;
}

async function resolveRestaurant(recipients: string[]): Promise<{ id: string; name: string } | null> {
	if (!EMAIL_INGEST_DOMAIN) return null;
	const suffix = `@${EMAIL_INGEST_DOMAIN}`.toLowerCase();
	const tokens = recipients
		.map(a => a.trim().toLowerCase())
		.filter(a => a.endsWith(suffix))
		.map(a => a.slice(0, -suffix.length));
	if (tokens.length === 0) return null;

	return runAsSystem(async () => {
		for (const token of tokens) {
			// tenant-scope-ok: this IS the tenant resolution step — the inbound
			// address's random token is globally unique and determines which
			// restaurant owns the inbox. There is no tenant context yet.
			const [row] = await db
				.select({ id: restaurants.id, name: restaurants.name })
				.from(restaurants)
				.where(eq(restaurants.emailIngestToken, token))
				.limit(1);
			if (row) return row;
		}
		return null;
	});
}

async function readWithinLimit(res: Response): Promise<Buffer> {
	const declared = Number(res.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) throw new MediaTooLargeError(declared);

	const reader = res.body?.getReader();
	if (!reader) {
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length > MAX_FILE_BYTES) throw new MediaTooLargeError(buf.length);
		return buf;
	}

	const chunks: Buffer[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_FILE_BYTES) {
			await reader.cancel().catch(() => {});
			throw new MediaTooLargeError(total);
		}
		chunks.push(Buffer.from(value));
	}
	return Buffer.concat(chunks);
}

export async function fetchResendAttachment(emailId: string, attachmentId: string): Promise<Buffer> {
	const client = getResendClient();
	if (!client) throw new Error('[email-ingest] RESEND_API_KEY not configured — cannot fetch attachment');
	const { data, error } = await client.emails.receiving.attachments.get({ emailId, id: attachmentId });
	if (error || !data?.download_url) {
		throw new Error(`[email-ingest] failed to fetch attachment metadata: ${error?.message ?? 'no download_url'}`);
	}
	const res = await fetch(data.download_url);
	if (!res.ok) throw new Error(`[email-ingest] attachment download failed with status ${res.status}`);
	return readWithinLimit(res);
}

export interface InboundAttachmentRef {
	id: string;
	filename: string | null;
	contentType: string;
	contentDisposition: string | null;
}

export interface InboundEmailMessage {
	emailId: string;
	from: string;
	to: string[];
	attachments: InboundAttachmentRef[];
}

export interface EmailIngestDeps {
	fetchAttachment(emailId: string, attachmentId: string): Promise<Buffer>;
}

export type EmailIngestOutcome =
	| { kind: 'disabled' }
	| { kind: 'duplicate' }
	| { kind: 'unknown-recipient' }
	| { kind: 'access-denied' }
	| { kind: 'rate-limited' }
	| { kind: 'quota-exceeded' }
	| { kind: 'no-valid-attachments'; rejected: RejectedUpload[] }
	| { kind: 'ingested'; restaurantId: string; batchId: string };

async function processInbound(
	restaurant: { id: string; name: string },
	msg: InboundEmailMessage,
	deps: EmailIngestDeps,
	requestId?: string,
): Promise<EmailIngestOutcome> {
	const entitlements = await getEntitlements(restaurant.id);
	if (!entitlements.access.allowed) return { kind: 'access-denied' };

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'upload', max: 10 }, { restaurantId: restaurant.id }))) {
		return { kind: 'rate-limited' };
	}

	const attachments = msg.attachments.filter(a => a.contentDisposition !== 'inline');
	const remaining = await remainingMonthlyQuota(restaurant.id, entitlements.monthlyQuota);
	if (remaining !== null && attachments.length > remaining) return { kind: 'quota-exceeded' };

	const fetched = await Promise.all(attachments.map(async (a): Promise<File | RejectedUpload> => {
		try {
			const buf = await deps.fetchAttachment(msg.emailId, a.id);
			return new File([new Uint8Array(buf)], a.filename ?? a.id, { type: a.contentType });
		} catch (err) {
			if (err instanceof MediaTooLargeError) return { name: a.filename ?? a.id, reason: 'tooLarge' };
			throw err;
		}
	}));

	const files = fetched.filter((f): f is File => f instanceof File);
	const fetchRejections = fetched.filter((f): f is RejectedUpload => !(f instanceof File));

	const { saved, keys, errors } = await saveUploadedFiles(files, randomBytes(16).toString('hex'));
	const allRejected = [...fetchRejections, ...errors];

	if (saved.length === 0) {
		await sendEmail(emailIngestRejectedEmail(
			msg.from,
			restaurant.name,
			allRejected.map(e => ({ name: e.name, reason: e.reason })),
		));
		return { kind: 'no-valid-attachments', rejected: allRejected };
	}

	const { batchId, itemIds } = await createBatch(
		restaurant.id,
		saved.map((name, i) => ({ key: keys[i]!, name })),
		{ source: 'email', sourceRef: msg.from },
	);
	await enqueueBatchExtraction(itemIds[0]!, restaurant.id, {
		getItem,
		getBatchItems,
		markQueued,
		enqueue: (id, rid) => enqueueExtraction(id, rid, requestId),
	}, requestId);

	return { kind: 'ingested', restaurantId: restaurant.id, batchId };
}

export async function ingestInboundEmail(
	msg: InboundEmailMessage,
	deps: EmailIngestDeps,
	requestId?: string,
): Promise<EmailIngestOutcome> {
	if (EMAIL_INGEST_ENABLED !== 'true') return { kind: 'disabled' };
	if (!(await claimIdempotencyKey(EMAIL_INGEST_SCOPE, msg.emailId))) return { kind: 'duplicate' };

	try {
		const restaurant = await resolveRestaurant(msg.to);
		if (!restaurant) return { kind: 'unknown-recipient' };
		return await runWithTenantContext(restaurant.id, () => processInbound(restaurant, msg, deps, requestId));
	} catch (err) {
		await releaseIdempotencyKey(EMAIL_INGEST_SCOPE, msg.emailId).catch(e =>
			console.error('[email-ingest] failed to release claim:', e));
		throw err;
	}
}
