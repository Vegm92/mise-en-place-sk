export const WHATSAPP_NOTIFY_QUEUE = 'whatsapp-notify';
export const WHATSAPP_INBOUND_QUEUE = 'whatsapp-inbound';

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
});
