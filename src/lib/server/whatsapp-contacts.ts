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

	const [existing] = await db
		.select({ restaurantId: whatsappContacts.restaurantId })
		.from(whatsappContacts)
		.where(eq(whatsappContacts.phoneNumber, normalized.phone))
		.limit(1);

	return existing?.restaurantId === restaurantId ? { ok: true } : { ok: false, reason: 'taken' };
}

export async function removeContact(restaurantId: string, id: number): Promise<boolean> {
	const tdb = forTenant(restaurantId);
	const deleted = await db
		.delete(whatsappContacts)
		.where(tdb.scope(whatsappContacts.restaurantId, eq(whatsappContacts.id, id)))
		.returning({ id: whatsappContacts.id });
	return deleted.length > 0;
}
