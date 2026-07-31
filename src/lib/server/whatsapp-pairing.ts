import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { whatsappPairingCodes } from './schema';
import { addContact } from './whatsapp-contacts';
import { checkRateLimit } from './rate-limiter';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRTUVWXYZ';
const CODE_LENGTH = 6;

export const CODE_TTL_MS = 15 * 60 * 1000;

const REDEEM_ATTEMPTS = 5;
const REDEEM_WINDOW_S = 60 * 60;

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

export function normalizeCode(input: string): string | null {
	const cleaned = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (cleaned.length !== CODE_LENGTH) return null;
	for (const ch of cleaned) if (!CODE_ALPHABET.includes(ch)) return null;
	return cleaned;
}

export type GenerateResult =
	| { ok: true; pairing: PairingCode }
	| { ok: false; reason: 'rateLimited' | 'error' };

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

export async function revokePairingCodes(restaurantId: string): Promise<void> {
	const tdb = forTenant(restaurantId);
	await db
		.update(whatsappPairingCodes)
		.set({ expiresAt: new Date(0) })
		.where(tdb.scope(whatsappPairingCodes.restaurantId, isNull(whatsappPairingCodes.redeemedAt)));
}

export type RedeemResult =
	| { ok: true; restaurantId: string }
	| { ok: false; reason: 'invalid' }
	| { ok: false; reason: 'taken' }
	| { ok: false; reason: 'rateLimited' };

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

	if (!claimed) return { ok: false, reason: 'invalid' };

	const added = await addContact(claimed.restaurantId, phone, claimed.displayName);
	if (!added.ok) {
		await db
			.update(whatsappPairingCodes)
			.set({ redeemedAt: null, redeemedBy: null })
			.where(eq(whatsappPairingCodes.id, claimed.id));
		return { ok: false, reason: added.reason === 'taken' ? 'taken' : 'invalid' };
	}

	return { ok: true, restaurantId: claimed.restaurantId };
}
