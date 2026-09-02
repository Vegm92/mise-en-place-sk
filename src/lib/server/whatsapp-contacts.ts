import { asc, eq } from 'drizzle-orm';
import { db, forTenant } from './db';
import { whatsappContacts } from './schema';
import { normalizePhoneNumber } from '$lib/phone';
import { trackEvent } from './events';

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

	// tenant-scope-ok: deliberately cross-tenant — resolves who already holds a
	// globally-unique phone number so the caller can report it as taken. Only the
	// owning restaurantId is read, and it is compared, never returned.
	const [existing] = await db
		.select({ restaurantId: whatsappContacts.restaurantId })
		.from(whatsappContacts)
		.where(eq(whatsappContacts.phoneNumber, normalized.phone))
		.limit(1);

	return existing?.restaurantId === restaurantId ? { ok: true } : { ok: false, reason: 'taken' };
}

export async function removeContact(restaurantId: string, id: number, releasedBy?: string): Promise<boolean> {
	const tdb = forTenant(restaurantId);
	const deleted = await db
		.delete(whatsappContacts)
		.where(tdb.scope(whatsappContacts.restaurantId, eq(whatsappContacts.id, id)))
		.returning({ id: whatsappContacts.id, phoneNumber: whatsappContacts.phoneNumber });

	if (deleted.length === 0) return false;

	await trackEvent('whatsapp_contact_released', restaurantId, {
		contactId: deleted[0].id,
		phoneNumber: deleted[0].phoneNumber,
		releasedBy: releasedBy ?? null,
		method: 'owner',
	});
	return true;
}

export type ReleaseByPhoneResult =
	| { ok: true; restaurantId: string }
	| { ok: false; reason: 'invalid' | 'notFound' };

export async function releaseContactByPhone(rawPhone: string, releasedBy: string): Promise<ReleaseByPhoneResult> {
	const normalized = normalizePhoneNumber(rawPhone);
	if (!normalized.ok) return { ok: false, reason: 'invalid' };

	// tenant-scope-ok: support tooling — releasing a number by the number
	// itself is inherently cross-tenant (the caller does not know which
	// restaurant holds it), gated by admin auth in the calling route.
	const [deleted] = await db
		.delete(whatsappContacts)
		.where(eq(whatsappContacts.phoneNumber, normalized.phone))
		.returning({ id: whatsappContacts.id, restaurantId: whatsappContacts.restaurantId, phoneNumber: whatsappContacts.phoneNumber });

	if (!deleted) return { ok: false, reason: 'notFound' };

	await trackEvent('whatsapp_contact_released', deleted.restaurantId, {
		contactId: deleted.id,
		phoneNumber: deleted.phoneNumber,
		releasedBy,
		method: 'support',
	});
	return { ok: true, restaurantId: deleted.restaurantId };
}
