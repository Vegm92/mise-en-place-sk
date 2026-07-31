/**
 * Self-service WhatsApp enrolment by pairing code (issue #320).
 *
 * The manual path — the owner types a staff member's phone number into Settings
 * — stays, because it is still the right way for the owner to authorise their
 * own number. It just isn't the right way to onboard a new hire: a typo there
 * produces the worst failure mode available, where the chef gets "este número
 * no está autorizado" while the authorised row in Settings looks perfectly fine.
 *
 * A code inverts the trust direction. The owner generates one, the chef messages
 * it from the phone they will actually use, and the number is taken from the
 * webhook's `from` field — so it cannot be mistyped, and it is proven to be
 * controlled by whoever holds the code.
 *
 * Redemption runs before the bot's authorisation gate, since an enrolling number
 * is by definition not yet authorised. That makes it the one unauthenticated
 * write path into `whatsapp_contacts`, so it is deliberately narrow: codes are
 * single-use, short-lived, redeemed by a guarded UPDATE (never a read-then-
 * write), and rate-limited per sender. Failures are indistinguishable from each
 * other, so a wrong code never reveals whether it exists.
 */
import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { whatsappPairingCodes } from './schema';
import { addContact } from './whatsapp-contacts';
import { checkRateLimit } from './rate-limiter';

/**
 * Ambiguity is the enemy here: the code is read off a screen and typed into a
 * phone, often by someone else. 0/O, 1/I/L and 5/S are omitted, which costs a
 * little entropy and saves a lot of support.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRTUVWXYZ';
const CODE_LENGTH = 6;

/** ~15 minutes: long enough to walk a code across a kitchen, short enough that a
 *  screenshot left on a phone is not a standing invitation. */
export const CODE_TTL_MS = 15 * 60 * 1000;

/** Redemption attempts per sender. 30 codes^6 ≈ 7.3e8, so this is far below
 *  anything that could brute-force a code inside its TTL. */
const REDEEM_ATTEMPTS = 5;
const REDEEM_WINDOW_S = 60 * 60;

/** How many codes an owner may mint per hour — abuse guard, not a UX limit. */
const GENERATE_LIMIT = 10;
const GENERATE_WINDOW_S = 60 * 60;

export interface PairingCode {
	code: string;
	displayName: string | null;
	expiresAt: Date;
}

function randomCode(): string {
	let out = '';
	for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return out;
}

/**
 * Normalise what the sender typed. People add spaces and dashes, and phone
 * keyboards capitalise unpredictably, so a code is compared case- and
 * separator-insensitively.
 */
export function normalizeCode(input: string): string | null {
	const cleaned = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (cleaned.length !== CODE_LENGTH) return null;
	// Anything using a character outside the alphabet cannot be one of ours; not
	// treating it as a code attempt keeps ordinary chat out of the rate limiter.
	for (const ch of cleaned) if (!CODE_ALPHABET.includes(ch)) return null;
	return cleaned;
}

export type GenerateResult =
	| { ok: true; pairing: PairingCode }
	| { ok: false; reason: 'rateLimited' | 'error' };

/**
 * Mint a code for a restaurant, replacing any it already has outstanding.
 *
 * One live code per restaurant at a time: the Settings card shows "the" code, so
 * a second one silently superseding the one already written on a notepad would
 * be worse than reissuing visibly. Expiring the old ones also keeps the number
 * of simultaneously guessable codes at one per tenant.
 */
export async function generatePairingCode(
	restaurantId: string,
	userId: string,
	displayName: string | null,
): Promise<GenerateResult> {
	if (!(await checkRateLimit(`whatsapp-pair-gen:${restaurantId}`, GENERATE_LIMIT, GENERATE_WINDOW_S))) {
		return { ok: false, reason: 'rateLimited' };
	}

	const tdb = forTenant(restaurantId);
	const expiresAt = new Date(Date.now() + CODE_TTL_MS);

	try {
		await db
			.update(whatsappPairingCodes)
			.set({ expiresAt: new Date(0) })
			.where(tdb.scope(whatsappPairingCodes.restaurantId, isNull(whatsappPairingCodes.redeemedAt)));

		// The unique index is global, so a collision with another tenant's live
		// code is possible in principle. Retry rather than surface it — at 7.3e8
		// values against a handful of live codes this effectively never runs.
		for (let attempt = 0; attempt < 5; attempt++) {
			const code = randomCode();
			const [row] = await db
				.insert(whatsappPairingCodes)
				.values({ restaurantId, code, displayName: displayName?.trim() || null, createdBy: userId, expiresAt })
				.onConflictDoNothing({ target: whatsappPairingCodes.code })
				.returning({ code: whatsappPairingCodes.code, expiresAt: whatsappPairingCodes.expiresAt });
			if (row) {
				return { ok: true, pairing: { code: row.code, displayName: displayName?.trim() || null, expiresAt: row.expiresAt } };
			}
		}
		console.error('[whatsapp-pairing] exhausted retries generating a unique code');
		return { ok: false, reason: 'error' };
	} catch (err) {
		console.error('[whatsapp-pairing] failed to generate a code:', err);
		return { ok: false, reason: 'error' };
	}
}

/** The restaurant's live, unredeemed code, if any — what Settings displays. */
export async function activePairingCode(restaurantId: string): Promise<PairingCode | null> {
	const tdb = forTenant(restaurantId);
	const [row] = await db
		.select({
			code: whatsappPairingCodes.code,
			displayName: whatsappPairingCodes.displayName,
			expiresAt: whatsappPairingCodes.expiresAt,
		})
		.from(whatsappPairingCodes)
		.where(tdb.scope(whatsappPairingCodes.restaurantId, and(
			isNull(whatsappPairingCodes.redeemedAt),
			gt(whatsappPairingCodes.expiresAt, sql`now()`),
		)))
		.orderBy(desc(whatsappPairingCodes.createdAt))
		.limit(1);
	return row ?? null;
}

/** Discard the live code without minting a replacement. */
export async function revokePairingCodes(restaurantId: string): Promise<void> {
	const tdb = forTenant(restaurantId);
	await db
		.update(whatsappPairingCodes)
		.set({ expiresAt: new Date(0) })
		.where(tdb.scope(whatsappPairingCodes.restaurantId, isNull(whatsappPairingCodes.redeemedAt)));
}

export type RedeemResult =
	/** Bound successfully — `restaurantId` is the tenant the number now belongs to. */
	| { ok: true; restaurantId: string }
	/** Unknown, expired or already-used code. Deliberately one outcome, not three. */
	| { ok: false; reason: 'invalid' }
	/** The sender's number is already authorised somewhere else. */
	| { ok: false; reason: 'taken' }
	/** Too many attempts from this sender — answer with nothing at all. */
	| { ok: false; reason: 'rateLimited' };

/**
 * Redeem `rawCode` for `phone` (E.164 without '+', straight from the webhook).
 *
 * The claim is a guarded UPDATE — `redeemed_at IS NULL AND expires_at > now()`,
 * RETURNING — so two deliveries of the same message, or two people racing on one
 * code, cannot both win. Only the winner then writes the contact row.
 */
export async function redeemPairingCode(phone: string, rawCode: string): Promise<RedeemResult> {
	const code = normalizeCode(rawCode);
	if (!code) return { ok: false, reason: 'invalid' };

	if (!(await checkRateLimit(`whatsapp-pair:${phone}`, REDEEM_ATTEMPTS, REDEEM_WINDOW_S))) {
		return { ok: false, reason: 'rateLimited' };
	}

	let claimed: { id: number; restaurantId: string; displayName: string | null } | undefined;
	try {
		[claimed] = await db
			.update(whatsappPairingCodes)
			.set({ redeemedAt: new Date(), redeemedBy: phone })
			.where(and(
				eq(whatsappPairingCodes.code, code),
				isNull(whatsappPairingCodes.redeemedAt),
				gt(whatsappPairingCodes.expiresAt, sql`now()`),
			))
			.returning({
				id: whatsappPairingCodes.id,
				restaurantId: whatsappPairingCodes.restaurantId,
				displayName: whatsappPairingCodes.displayName,
			});
	} catch (err) {
		console.error('[whatsapp-pairing] redemption claim failed:', err);
		return { ok: false, reason: 'invalid' };
	}

	// Unknown, expired and already-redeemed all land here, and all look the same
	// from outside — an attacker must not learn that a code exists.
	if (!claimed) return { ok: false, reason: 'invalid' };

	const added = await addContact(claimed.restaurantId, phone, claimed.displayName);
	if (!added.ok) {
		// `whatsapp_contacts_phone_unique` is global: this number belongs to
		// another restaurant. Release the code rather than burning the owner's —
		// nothing was enrolled, so nothing should have been spent.
		await db
			.update(whatsappPairingCodes)
			.set({ redeemedAt: null, redeemedBy: null })
			.where(eq(whatsappPairingCodes.id, claimed.id));
		return { ok: false, reason: added.reason === 'taken' ? 'taken' : 'invalid' };
	}

	return { ok: true, restaurantId: claimed.restaurantId };
}
