/**
 * Authorised WhatsApp numbers (issue #187 follow-up).
 *
 * `whatsapp_contacts` is the allow-list the bot checks before it will process
 * anything: an unknown sender is answered with "no autorizado" and dropped
 * (`whatsapp-bot.ts`). Until this module existed the table could only be
 * populated with hand-written SQL, which made the bot effectively unusable for
 * anyone who wasn't the operator.
 *
 * Numbers are stored the way Meta delivers them in the webhook `from` field:
 * E.164 **without** the leading '+', e.g. "34612345678". Anything a user types
 * has to be normalised into that shape or the lookup silently never matches.
 */
import { asc, eq } from 'drizzle-orm';
import { db, forTenant } from './db';
import { whatsappContacts } from './schema';
import { normalizePhoneNumber } from '$lib/phone';

export interface WhatsAppContact {
	id: number;
	phoneNumber: string;
	displayName: string | null;
	createdAt: Date | null;
}

export async function listContacts(restaurantId: string): Promise<WhatsAppContact[]> {
	const tdb = forTenant(restaurantId);
	return db
		.select({
			id:          whatsappContacts.id,
			phoneNumber: whatsappContacts.phoneNumber,
			displayName: whatsappContacts.displayName,
			createdAt:   whatsappContacts.createdAt,
		})
		.from(whatsappContacts)
		.where(tdb.scope(whatsappContacts.restaurantId))
		.orderBy(asc(whatsappContacts.createdAt));
}

export type AddContactResult =
	| { ok: true }
	| { ok: false; reason: 'invalid' | 'tooShort' | 'tooLong' | 'taken' };

/**
 * Authorise a number for this restaurant.
 *
 * `whatsapp_contacts_phone_unique` is global, not per-tenant: one phone maps to
 * exactly one restaurant, because the bot resolves the tenant *from* the number
 * and a second row would make that ambiguous. A number already claimed by
 * another tenant therefore fails as 'taken' rather than silently rebinding it.
 */
export async function addContact(
	restaurantId: string,
	rawPhone: string,
	displayName: string | null,
): Promise<AddContactResult> {
	const normalized = normalizePhoneNumber(rawPhone);
	if (!normalized.ok) {
		return { ok: false, reason: normalized.reason === 'empty' ? 'invalid' : normalized.reason };
	}

	const inserted = await db
		.insert(whatsappContacts)
		.values({
			restaurantId,
			phoneNumber: normalized.phone,
			displayName: displayName?.trim() || null,
		})
		.onConflictDoNothing({ target: whatsappContacts.phoneNumber })
		.returning({ id: whatsappContacts.id });

	if (inserted.length > 0) return { ok: true };

	// Conflict: either this tenant already has it (idempotent success) or
	// another tenant holds it (a real error the user needs to see).
	const [existing] = await db
		.select({ restaurantId: whatsappContacts.restaurantId })
		.from(whatsappContacts)
		.where(eq(whatsappContacts.phoneNumber, normalized.phone))
		.limit(1);

	return existing?.restaurantId === restaurantId ? { ok: true } : { ok: false, reason: 'taken' };
}

/** De-authorise a number. Tenant-scoped so one restaurant cannot remove another's. */
export async function removeContact(restaurantId: string, id: number): Promise<boolean> {
	const tdb = forTenant(restaurantId);
	const deleted = await db
		.delete(whatsappContacts)
		.where(tdb.scope(whatsappContacts.restaurantId, eq(whatsappContacts.id, id)))
		.returning({ id: whatsappContacts.id });
	return deleted.length > 0;
}
