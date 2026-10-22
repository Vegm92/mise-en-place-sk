import { type ActionOutcome, reject, succeed } from './action-outcome';
import { WHATSAPP_ACCESS_TOKEN, WHATSAPP_DISPLAY_NUMBER, WHATSAPP_PHONE_NUMBER_ID } from './env';
import { listContacts, removeContact } from './whatsapp-contacts';
import { activePairingCode, generatePairingCode, revokePairingCodes } from './whatsapp-pairing';
import { requireOwner } from './restaurant-admin';
import { renderQrSvg } from './qr-svg';
import { formatPhoneNumber, normalizePhoneNumber, waMeLink } from '$lib/phone';

export const WHATSAPP_ENABLED = Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);

export const WHATSAPP_BOT_NUMBER = (() => {
	if (!WHATSAPP_ENABLED || !WHATSAPP_DISPLAY_NUMBER) return null;
	const normalized = normalizePhoneNumber(WHATSAPP_DISPLAY_NUMBER);
	if (!normalized.ok) {
		console.warn(`[settings] WHATSAPP_DISPLAY_NUMBER is not a usable phone number (${normalized.reason}) — hiding the click-to-chat block`);
		return null;
	}
	const link = waMeLink(normalized.phone);
	return {
		display: formatPhoneNumber(normalized.phone),
		link,
		qrSvg: renderQrSvg(link),
	};
})();

export async function loadWhatsappPanel(restaurantId: string) {
	const [contacts, pairingCode] = await Promise.all([
		WHATSAPP_ENABLED ? listContacts(restaurantId) : Promise.resolve([]),
		WHATSAPP_ENABLED ? activePairingCode(restaurantId) : Promise.resolve(null),
	]);
	return { contacts, pairingCode };
}

async function ownerGate(restaurantId: string, userId: string): Promise<ActionOutcome | null> {
	if (!WHATSAPP_ENABLED) return reject(403, 'set.whatsapp.err.disabled');
	if (!(await requireOwner(restaurantId, userId))) return reject(403, 'set.whatsapp.err.notOwner');
	return null;
}

export async function inviteWhatsappContact(restaurantId: string, userId: string, form: FormData): Promise<ActionOutcome> {
	const denied = await ownerGate(restaurantId, userId);
	if (denied) return denied;

	const phone = ((form.get('phone') as string) ?? '').trim();
	const name  = ((form.get('name')  as string) ?? '').trim();
	if (!phone) return reject(422, 'set.whatsapp.err.invalid');
	if (name.length > 80) return reject(422, 'set.whatsapp.err.nameTooLong');

	const result = await generatePairingCode(restaurantId, userId, name, phone);
	if (!result.ok) {
		const errors = {
			invalid:     'set.whatsapp.err.invalid',
			tooShort:    'set.whatsapp.err.tooShort',
			tooLong:     'set.whatsapp.err.tooLong',
			rateLimited: 'set.whatsapp.err.pairRateLimited',
			error:       'set.whatsapp.err.pairFailed',
		} as const;
		return reject(result.reason === 'rateLimited' ? 429 : 422, errors[result.reason]);
	}

	return succeed('set.whatsapp.ok.invited');
}

export async function releaseWhatsappContact(restaurantId: string, userId: string, form: FormData): Promise<ActionOutcome> {
	const denied = await ownerGate(restaurantId, userId);
	if (denied) return denied;

	const id = Number(form.get('id'));
	if (!Number.isInteger(id)) return reject(422, 'set.whatsapp.err.invalid');

	await removeContact(restaurantId, id, userId);
	return succeed('set.whatsapp.ok.removed');
}

export async function issuePairingCode(restaurantId: string, userId: string, form: FormData): Promise<ActionOutcome> {
	const denied = await ownerGate(restaurantId, userId);
	if (denied) return denied;

	const name = ((form.get('name') as string) ?? '').trim();
	if (name.length > 80) return reject(422, 'set.whatsapp.err.nameTooLong');

	const result = await generatePairingCode(restaurantId, userId, name);
	if (!result.ok) {
		return result.reason === 'rateLimited'
			? reject(429, 'set.whatsapp.err.pairRateLimited')
			: reject(500, 'set.whatsapp.err.pairFailed');
	}

	return succeed('set.whatsapp.ok.pairGenerated');
}

export async function revokePairingCode(restaurantId: string, userId: string): Promise<ActionOutcome> {
	const denied = await ownerGate(restaurantId, userId);
	if (denied) return denied;

	await revokePairingCodes(restaurantId);
	return succeed('set.whatsapp.ok.pairRevoked');
}
