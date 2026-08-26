import { getFlag } from '../../app-flags';
import { WHATSAPP_BOT_ENABLED } from '../../env';
import type { WhatsAppTransport } from './transport';

export const WHATSAPP_BOT_FLAG = 'whatsapp_bot_enabled';
export const WHATSAPP_QR_FLAG = 'whatsapp_qr';
export const WHATSAPP_STATUS_FLAG = 'whatsapp_status';

export async function whatsappBotEnabled(): Promise<boolean> {
	if (WHATSAPP_BOT_ENABLED !== 'true') return false;
	try {
		return (await getFlag(WHATSAPP_BOT_FLAG)) !== 'false';
	} catch (err) {
		console.error('[whatsapp] kill-switch lookup failed (staying off):', err);
		return false;
	}
}

export async function startWhatsAppTransport(): Promise<WhatsAppTransport | null> {
	if (!(await whatsappBotEnabled())) return null;
	const { createBaileysTransport } = await import('./driver-baileys');
	const transport = createBaileysTransport();
	await transport.start();
	return transport;
}
