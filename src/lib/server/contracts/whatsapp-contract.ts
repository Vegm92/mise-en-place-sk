import type { WhatsAppInboundMessage } from '../integrations/whatsapp/transport.js';

export const WHATSAPP_NOTIFY_QUEUE = 'whatsapp-notify';
export const WHATSAPP_INBOUND_QUEUE = 'whatsapp-inbound';

export const WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE = `${WHATSAPP_NOTIFY_QUEUE}-dead-letter`;
export const WHATSAPP_INBOUND_DEAD_LETTER_QUEUE = `${WHATSAPP_INBOUND_QUEUE}-dead-letter`;

export interface WhatsAppNotifyJobData {
	itemId: string;
	restaurantId: string;
	requestId?: string;
}

export interface WhatsAppInboundJobData {
	messageId: string;
	msg: WhatsAppInboundMessage;
	requestId?: string;
}

export const WHATSAPP_NOTIFY_OPTIONS = (itemId: string) => ({
	retryLimit: 3,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 600,
	expireInSeconds: 300,
	singletonKey: itemId,
	deadLetter: WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE,
});

export const WHATSAPP_INBOUND_OPTIONS = (messageId: string) => ({
	retryLimit: 3,
	retryDelay: 30,
	retryBackoff: true,
	retryDelayMax: 600,
	expireInSeconds: 300,
	singletonKey: messageId,
	deadLetter: WHATSAPP_INBOUND_DEAD_LETTER_QUEUE,
});
