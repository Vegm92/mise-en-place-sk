import { downloadWhatsAppMedia, sendWhatsAppMessage } from './whatsapp';
import { handleInboundMessage } from './integrations/whatsapp/message-handler';
import type {
	WhatsAppInboundMessage,
	WhatsAppMediaRef,
	WhatsAppMessageContext,
} from './integrations/whatsapp/transport';

export type { WhatsAppInboundMessage };

const metaContext: WhatsAppMessageContext = {
	sendText: (to, body) => sendWhatsAppMessage(to, body),
	downloadMedia: (ref: WhatsAppMediaRef) => downloadWhatsAppMedia(ref.id),
};

export async function handleWhatsAppMessage(msg: WhatsAppInboundMessage): Promise<void> {
	await handleInboundMessage(msg, metaContext);
}
