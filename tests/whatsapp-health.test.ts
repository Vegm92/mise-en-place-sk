/**
 * Shared WhatsApp number health (issue #321).
 *
 * One WhatsApp Business number serves every tenant, so Meta's per-number quality
 * rating is shared: blocks caused by one restaurant's staff degrade it for all of
 * them, and a sufficiently degraded number can be restricted — which stops
 * ingest for the whole customer base at once.
 *
 * These tests pin the classification, because it decides whether an event pages
 * anyone. Meta's account payloads vary by event and change shape between API
 * versions, so the parser has to read defensively and must never drop an event
 * it does not recognise.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/server/db', () => ({ db: {} }));
vi.mock('@sentry/sveltekit', () => ({ captureMessage: vi.fn() }));

import { parseAccountEvent } from '../src/lib/server/whatsapp-health';

const parse = (field: string, value: Record<string, unknown>) => parseAccountEvent({ field, value });

describe('severity classification', () => {
	it('treats a restriction as critical — ingest stops for every tenant', () => {
		expect(parse('account_update', { event: 'ACCOUNT_RESTRICTION' }).severity).toBe('critical');
		expect(parse('account_update', { event: 'ACCOUNT_VIOLATION' }).severity).toBe('critical');
		expect(parse('account_update', { event: 'ACCOUNT_DELETED' }).severity).toBe('critical');
	});

	it('treats a RED quality rating as critical', () => {
		expect(parse('phone_number_quality_update', { current_quality_rating: 'RED' }).severity).toBe('critical');
	});

	it('escalates on a ban or restriction block regardless of the event name', () => {
		// The event name varies between API versions; the payload block does not.
		expect(parse('account_update', { event: 'SOMETHING_NEW', ban_info: { waba_ban_state: 'SCHEDULE_FOR_DISABLE' } }).severity).toBe('critical');
		expect(parse('account_update', { event: 'SOMETHING_NEW', restriction_info: [{ restriction_type: 'RESTRICTED_BIZ_INITIATED_MESSAGING' }] }).severity).toBe('critical');
	});

	it('treats a flag or a YELLOW rating as a warning', () => {
		expect(parse('phone_number_quality_update', { event: 'FLAGGED' }).severity).toBe('warning');
		expect(parse('phone_number_quality_update', { current_quality_rating: 'YELLOW' }).severity).toBe('warning');
	});

	it('treats recovery as information, not an alert', () => {
		// UNFLAGGED and a return to GREEN are the good news — they must not keep
		// paging after the incident is over.
		expect(parse('phone_number_quality_update', { event: 'UNFLAGGED' }).severity).toBe('info');
		expect(parse('phone_number_quality_update', { current_quality_rating: 'GREEN' }).severity).toBe('info');
	});

	it('does not invent an alert for an unrecognised event', () => {
		// Recorded, but quietly — an unknown field must not become a false page.
		const parsed = parse('message_template_status_update', { event: 'APPROVED' });
		expect(parsed.severity).toBe('info');
		expect(parsed.event).toBe('APPROVED');
	});
});

describe('field extraction', () => {
	it('reads the rating from either of the shapes Meta sends it in', () => {
		expect(parse('phone_number_quality_update', { current_quality_rating: 'YELLOW' }).qualityRating).toBe('YELLOW');
		expect(parse('account_update', { quality_update: { current_quality_rating: 'RED' } }).qualityRating).toBe('RED');
		// Some payloads put the rating in `event` itself.
		expect(parse('phone_number_quality_update', { event: 'GREEN' }).qualityRating).toBe('GREEN');
	});

	it('picks up the number and the messaging tier when present', () => {
		const parsed = parse('phone_number_quality_update', {
			display_phone_number: '34612345678',
			event: 'FLAGGED',
			current_limit: 'TIER_1K',
		});
		expect(parsed.phoneNumber).toBe('34612345678');
		expect(parsed.messagingLimit).toBe('TIER_1K');
	});

	it('returns nulls rather than throwing on an empty or oddly typed payload', () => {
		const parsed = parse('account_update', { event: 42, display_phone_number: null });
		expect(parsed.event).toBeNull();
		expect(parsed.phoneNumber).toBeNull();
		expect(parsed.qualityRating).toBeNull();
		expect(parsed.severity).toBe('info');
	});
});
