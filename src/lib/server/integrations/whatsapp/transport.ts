export interface WhatsAppMediaRef {
	id: string;
	mime_type?: string | undefined;
	filename?: string | undefined;
	file_length?: number | undefined;
	payload?: unknown;
}

export interface WhatsAppInboundMessage {
	from: string;
	id: string;
	type: string;
	timestamp?: string;
	text?: { body: string };
	image?: WhatsAppMediaRef;
	document?: WhatsAppMediaRef;
}

export interface WhatsAppDownloadedMedia {
	buffer: Buffer;
	extension: string;
}

export interface WhatsAppMessageContext {
	sendText(to: string, body: string): Promise<void>;
	downloadMedia(ref: WhatsAppMediaRef): Promise<WhatsAppDownloadedMedia>;
}

export type WhatsAppInboundHandler = (msg: WhatsAppInboundMessage) => Promise<void>;

export interface WhatsAppTransport extends WhatsAppMessageContext {
	start(): Promise<void>;
	stop(): Promise<void>;
	onMessage(cb: WhatsAppInboundHandler): void;
}
