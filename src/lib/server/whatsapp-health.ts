import * as Sentry from '@sentry/sveltekit';
import { desc, gte, sql } from 'drizzle-orm';
import { db } from './db';
import { whatsappAccountEvents } from './schema';

export type Severity = 'info' | 'warning' | 'critical';

const CRITICAL_EVENTS = new Set([
	'ACCOUNT_RESTRICTION',
	'ACCOUNT_VIOLATION',
	'ACCOUNT_DELETED',
	'DISABLED_UPDATE',
	'PARTNER_APP_UNINSTALLED',
	'PHONE_NUMBER_REMOVED',
]);

const WARNING_EVENTS = new Set([
	'FLAGGED',
	'ACCOUNT_WARNING',
	'PHONE_NUMBER_QUALITY_UPDATE',
]);

export interface AccountEventInput {
	field: string;
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

export function parseAccountEvent({ field, value }: AccountEventInput): ParsedEvent {
	const event = str(value.event);
	const phoneNumber = str(value.display_phone_number) ?? str(value.phone_number);
	const rating = str(value.current_quality_rating)
		?? str((value.quality_update as Record<string, unknown> | undefined)?.current_quality_rating)
		?? (event && ['GREEN', 'YELLOW', 'RED'].includes(event) ? event : null);
	const messagingLimit = str(value.current_limit) ?? str(value.messaging_limit_tier);

	let severity: Severity = 'info';
	if (event && CRITICAL_EVENTS.has(event)) severity = 'critical';
	else if (rating === 'RED') severity = 'critical';
	else if (value.ban_info || value.restriction_info) severity = 'critical';
	else if (event && WARNING_EVENTS.has(event)) severity = 'warning';
	else if (rating === 'YELLOW') severity = 'warning';

	if (event === 'UNFLAGGED' || rating === 'GREEN') severity = 'info';

	return { field, event, phoneNumber, qualityRating: rating, messagingLimit, severity };
}

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
	qualityRating: string | null;
	messagingLimit: string | null;
	severity: Severity;
	lastEvent: string | null;
	lastEventAt: Date | null;
	everReported: boolean;
}

const HEALTH_WINDOW_DAYS = 30;

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

	const rank: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
	let worst = recent[0] ?? null;
	for (const row of recent) {
		if (rank[row.severity as Severity] > rank[(worst?.severity ?? 'info') as Severity]) worst = row;
	}

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
