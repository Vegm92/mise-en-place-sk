export const WHATSAPP_NOTIFY_QUEUE = 'whatsapp-notify';
export const WHATSAPP_INBOUND_QUEUE = 'whatsapp-inbound';

export const WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE = `${WHATSAPP_NOTIFY_QUEUE}-dead-letter`;

export interface WhatsAppNotifyJobData {
	itemId: string;
	restaurantId: string;
	requestId?: string | undefined;
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
