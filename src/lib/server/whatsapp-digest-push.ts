import { renderTemplate, type Locale } from '$lib/i18n-messages';
import { APP_BASE_URL } from './env';
import { getOrCreateActiveShare } from './digest-share';
import { digestOptedInContacts, isDigestOptedIn } from './whatsapp-contacts';
import { sendWhatsAppMessage } from './whatsapp';

const DIGEST_LOCALE: Locale = 'es';

export function condensedDigestMessage(locale: Locale, name: string, link: string): string {
	return renderTemplate(locale, 'wa.digest.push', { name, link });
}

export async function pushWeeklyDigestOverWhatsApp(
	restaurantId: string,
	name: string,
	week: string,
	digest: string | null,
): Promise<void> {
	if (!digest) return;

	try {
		const contacts = await digestOptedInContacts(restaurantId);
		if (contacts.length === 0) return;

		const { token } = await getOrCreateActiveShare(restaurantId, week);
		const link = `${APP_BASE_URL}/s/${token}`;
		const body = condensedDigestMessage(DIGEST_LOCALE, name, link);

		for (const contact of contacts) {
			try {
				if (!(await isDigestOptedIn(restaurantId, contact.id))) continue;
				await sendWhatsAppMessage(contact.phoneNumber, body);
			} catch (err) {
				console.error('[whatsapp-digest] send failed', restaurantId, contact.id, err);
			}
		}
	} catch (err) {
		console.error('[whatsapp-digest] push failed', restaurantId, err);
	}
}
