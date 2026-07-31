/**
 * WhatsApp number health (issue #321).
 *
 * We run one WhatsApp Business number for every tenant. That is the right model
 * for this market — per-tenant numbers would require each restaurant to hold a
 * spare number and pass Meta business verification — but it concentrates a
 * shared reputation risk. Meta tracks a **quality rating** per business phone
 * number, driven largely by user blocks and reports, so blocks caused by one
 * restaurant's staff degrade the rating for all of them, and a sufficiently
 * degraded number can be restricted. When that happens, ingest stops for every
 * tenant simultaneously.
 *
 * The exposure is reputational rather than throughput-bound: the bot only ever
 * *replies*, inside the 24-hour service window, so the business-initiated
 * messaging-tier limits are largely not binding.
 *
 * Until now the webhook read only `value.messages[]`, so a downgrade would have
 * been discovered from support tickets. These events make it *delivered*.
 */
import * as Sentry from '@sentry/sveltekit';
import { desc, gte, sql } from 'drizzle-orm';
import { db } from './db';
import { whatsappAccountEvents } from './schema';

export type Severity = 'info' | 'warning' | 'critical';

/**
 * Events that mean the number is (or is about to be) unusable. Meta sends these
 * under `account_update`; any of them stops or threatens ingest for everyone.
 */
const CRITICAL_EVENTS = new Set([
	'ACCOUNT_RESTRICTION',
	'ACCOUNT_VIOLATION',
	'ACCOUNT_DELETED',
	'DISABLED_UPDATE',
	'PARTNER_APP_UNINSTALLED',
	'PHONE_NUMBER_REMOVED',
]);

/** Degraded but still delivering — worth a look before it becomes the above. */
const WARNING_EVENTS = new Set([
	'FLAGGED',
	'ACCOUNT_WARNING',
	'PHONE_NUMBER_QUALITY_UPDATE',
]);

export interface AccountEventInput {
	/** Meta's webhook field name, e.g. 'account_update'. */
	field: string;
	/** The `value` object from the change. */
	value: Record<string, unknown>;
}

interface ParsedEvent {
	field: string;
	event: string | null;
	phoneNumber: string | null;
	qualityRating: string | null;
	messagingLimit: string | null;
	severity: Severity;
}

function str(v: unknown): string | null {
	return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Reduce a webhook `value` object to the fields worth acting on.
 *
 * Meta's account payloads vary by event and change shape between API versions,
 * so this reads defensively and keeps the raw payload alongside: an unrecognised
 * event still lands as a row rather than being dropped.
 */
export function parseAccountEvent({ field, value }: AccountEventInput): ParsedEvent {
	const event = str(value.event);
	const phoneNumber = str(value.display_phone_number) ?? str(value.phone_number);
	// Quality arrives as `current_quality_rating` on some events and inside a
	// nested object on others; a plain `event` of GREEN/YELLOW/RED also occurs.
	const rating = str(value.current_quality_rating)
		?? str((value.quality_update as Record<string, unknown> | undefined)?.current_quality_rating)
		?? (event && ['GREEN', 'YELLOW', 'RED'].includes(event) ? event : null);
	const messagingLimit = str(value.current_limit) ?? str(value.messaging_limit_tier);

	let severity: Severity = 'info';
	if (event && CRITICAL_EVENTS.has(event)) severity = 'critical';
	else if (rating === 'RED') severity = 'critical';
	// A ban or restriction block is present regardless of the event name.
	else if (value.ban_info || value.restriction_info) severity = 'critical';
	else if (event && WARNING_EVENTS.has(event)) severity = 'warning';
	else if (rating === 'YELLOW') severity = 'warning';

	// FLAGGED is a warning, but its recovery (UNFLAGGED, back to GREEN) is not.
	if (event === 'UNFLAGGED' || rating === 'GREEN') severity = 'info';

	return { field, event, phoneNumber, qualityRating: rating, messagingLimit, severity };
}

/**
 * Persist an account event and, when it matters, page Sentry.
 *
 * Never throws: this runs inside the webhook handler, which must keep answering
 * Meta within 5 s and must not fail a batch of real messages over a bookkeeping
 * write.
 */
export async function recordAccountEvent(input: AccountEventInput): Promise<void> {
	const parsed = parseAccountEvent(input);

	try {
		await db.insert(whatsappAccountEvents).values({
			field: parsed.field,
			event: parsed.event,
			phoneNumber: parsed.phoneNumber,
			qualityRating: parsed.qualityRating,
			messagingLimit: parsed.messagingLimit,
			severity: parsed.severity,
			payload: input.value as Record<string, unknown>,
		});
	} catch (err) {
		console.error('[whatsapp-health] failed to record account event (non-fatal):', err);
	}

	if (parsed.severity === 'info') {
		console.info(`[whatsapp-health] ${parsed.field}/${parsed.event ?? 'unknown'}`);
		return;
	}

	// Treat a drop as an incident, not a metric — ingest for the entire customer
	// base runs through this one number.
	console.warn(`[whatsapp-health] ${parsed.severity}: ${parsed.field}/${parsed.event ?? 'unknown'} (quality ${parsed.qualityRating ?? 'n/a'})`);
	Sentry.captureMessage('whatsapp.account_health', {
		level: parsed.severity === 'critical' ? 'error' : 'warning',
		tags: {
			field: parsed.field,
			event: parsed.event ?? 'unknown',
			qualityRating: parsed.qualityRating ?? 'unknown',
		},
	});
}

export interface NumberHealth {
	/** Latest known quality rating, if Meta has ever told us one. */
	qualityRating: string | null;
	/** Latest known messaging tier. */
	messagingLimit: string | null;
	/** Worst severity seen in the recent window. */
	severity: Severity;
	/** The event behind that severity, for the admin detail line. */
	lastEvent: string | null;
	lastEventAt: Date | null;
	/** Whether we have ever received an account-level event at all. */
	everReported: boolean;
}

/** How far back "current" reaches. A red flag from last quarter is history. */
const HEALTH_WINDOW_DAYS = 30;

/**
 * Current health of the shared number, as far as Meta has told us.
 *
 * `everReported: false` is the normal state before the account-level webhook
 * fields are subscribed — the admin page reports that as "not subscribed"
 * rather than "healthy", because silence here is absence of data, not good news.
 */
export async function getNumberHealth(): Promise<NumberHealth> {
	const since = new Date(Date.now() - HEALTH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

	const [[latest], recent] = await Promise.all([
		db.select({
			qualityRating: whatsappAccountEvents.qualityRating,
			messagingLimit: whatsappAccountEvents.messagingLimit,
		})
			.from(whatsappAccountEvents)
			.orderBy(desc(whatsappAccountEvents.receivedAt))
			.limit(1),
		db.select({
			event: whatsappAccountEvents.event,
			field: whatsappAccountEvents.field,
			severity: whatsappAccountEvents.severity,
			qualityRating: whatsappAccountEvents.qualityRating,
			messagingLimit: whatsappAccountEvents.messagingLimit,
			receivedAt: whatsappAccountEvents.receivedAt,
		})
			.from(whatsappAccountEvents)
			.where(gte(whatsappAccountEvents.receivedAt, since))
			.orderBy(desc(whatsappAccountEvents.receivedAt))
			.limit(200),
	]);

	if (!latest) {
		return {
			qualityRating: null, messagingLimit: null, severity: 'info',
			lastEvent: null, lastEventAt: null, everReported: false,
		};
	}

	// The most recent event wins on the *current* rating; the window's worst
	// severity drives the badge, so a RED that flipped back an hour ago is still
	// visible rather than papered over by the recovery event.
	const rank: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
	let worst = recent[0] ?? null;
	for (const row of recent) {
		if (rank[row.severity as Severity] > rank[(worst?.severity ?? 'info') as Severity]) worst = row;
	}

	// Ratings are not sent on every event, so fall back through the window.
	const qualityRating = latest.qualityRating ?? recent.find(r => r.qualityRating)?.qualityRating ?? null;
	const messagingLimit = latest.messagingLimit ?? recent.find(r => r.messagingLimit)?.messagingLimit ?? null;

	return {
		qualityRating,
		messagingLimit,
		severity: (worst?.severity as Severity) ?? 'info',
		lastEvent: worst ? `${worst.field}/${worst.event ?? 'unknown'}` : null,
		lastEventAt: worst?.receivedAt ?? null,
		everReported: true,
	};
}

/** Most recent account events, newest first — the admin timeline. */
export async function recentAccountEvents(limit = 20) {
	return db.select({
		id: whatsappAccountEvents.id,
		field: whatsappAccountEvents.field,
		event: whatsappAccountEvents.event,
		phoneNumber: whatsappAccountEvents.phoneNumber,
		qualityRating: whatsappAccountEvents.qualityRating,
		messagingLimit: whatsappAccountEvents.messagingLimit,
		severity: whatsappAccountEvents.severity,
		receivedAt: whatsappAccountEvents.receivedAt,
	})
		.from(whatsappAccountEvents)
		.orderBy(desc(whatsappAccountEvents.receivedAt))
		.limit(limit);
}

/**
 * Authorised senders per tenant.
 *
 * If one restaurant ever generates a disproportionate share of blocks we need to
 * find and de-authorise their numbers quickly. Settings can do that per tenant,
 * but only if you already know which tenant — hence this view. Read-only on
 * purpose: removing a number stays an explicit act in the owner's own Settings.
 */
export async function contactsPerTenant(limit = 20) {
	const rows = await db.execute<{ name: string | null; restaurant_id: string; contacts: string }>(sql`
		SELECT r.id AS restaurant_id, r.name, COUNT(wc.id) AS contacts
		FROM whatsapp_contacts wc
		JOIN restaurants r ON r.id = wc.restaurant_id
		GROUP BY r.id, r.name
		ORDER BY COUNT(wc.id) DESC
		LIMIT ${limit}
	`);
	return (rows as unknown as Array<{ name: string | null; restaurant_id: string; contacts: string }>)
		.map(r => ({ restaurantId: r.restaurant_id, name: r.name ?? '—', contacts: Number(r.contacts) }));
}
