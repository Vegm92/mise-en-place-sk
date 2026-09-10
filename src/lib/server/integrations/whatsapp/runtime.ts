import { whatsappBotEnabled } from './whatsapp-config.js';
import type { WhatsAppTransport } from './transport';

export { WHATSAPP_BOT_FLAG, WHATSAPP_QR_FLAG, WHATSAPP_STATUS_FLAG } from './whatsapp-config.js';

export async function startWhatsAppTransport(): Promise<WhatsAppTransport | null> {
	if (!(await whatsappBotEnabled())) return null;
	const { createBaileysTransport } = await import('./driver-baileys');
	const transport = createBaileysTransport();
	await transport.start();
	return transport;
}
