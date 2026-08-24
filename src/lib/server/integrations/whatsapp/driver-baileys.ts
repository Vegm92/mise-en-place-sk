import makeWASocket, {
	Browsers,
	DisconnectReason,
	downloadMediaMessage,
	getContentType,
	jidNormalizedUser,
	makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import qrTerminal from 'qrcode-terminal';
import { normalizePhoneNumber } from '../../../phone';
import { setFlag } from '../../app-flags';
import { usePostgresAuthState } from './auth-state';
import { whatsappBotEnabled, WHATSAPP_QR_FLAG, WHATSAPP_STATUS_FLAG } from './runtime';
import type {
	WhatsAppDownloadedMedia,
	WhatsAppInboundHandler,
	WhatsAppInboundMessage,
	WhatsAppMediaRef,
	WhatsAppTransport,
} from './transport';

const RECONNECT_DELAY_MS = 5_000;

const MIME_TO_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'application/pdf': 'pdf',
	'application/xml': 'xml',
	'text/xml': 'xml',
};

const silentLogger = {
	level: 'silent',
	child: () => silentLogger,
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

function senderOf(msg: WAMessage): string | null {
	const jid = msg.key.remoteJid;
	if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return null;
	const digits = jidNormalizedUser(jid).split('@')[0];
	const normalized = normalizePhoneNumber(digits);
	return normalized.ok ? normalized.phone : null;
}

function mediaRefOf(msg: WAMessage): { type: string; ref: WhatsAppMediaRef } | null {
	const content = msg.message ?? undefined;
	const kind = getContentType(content);

	if (kind === 'imageMessage' && content?.imageMessage) {
		const m = content.imageMessage;
		return {
			type: 'image',
			ref: {
				id: msg.key.id ?? '',
				mime_type: m.mimetype ?? undefined,
				file_length: Number(m.fileLength ?? 0) || undefined,
				payload: msg,
			},
		};
	}

	if (kind === 'documentMessage' && content?.documentMessage) {
		const m = content.documentMessage;
		return {
			type: 'document',
			ref: {
				id: msg.key.id ?? '',
				mime_type: m.mimetype ?? undefined,
				filename: m.fileName ?? undefined,
				file_length: Number(m.fileLength ?? 0) || undefined,
				payload: msg,
			},
		};
	}

	return null;
}

function textOf(msg: WAMessage): string | null {
	const content = msg.message ?? undefined;
	return content?.conversation ?? content?.extendedTextMessage?.text ?? null;
}

function toInbound(msg: WAMessage): WhatsAppInboundMessage | null {
	const from = senderOf(msg);
	const id = msg.key.id;
	if (!from || !id || msg.key.fromMe) return null;

	const media = mediaRefOf(msg);
	if (media) {
		return {
			from,
			id,
			type: media.type,
			timestamp: String(msg.messageTimestamp ?? ''),
			...(media.type === 'image' ? { image: media.ref } : { document: media.ref }),
		};
	}

	const text = textOf(msg);
	if (text) return { from, id, type: 'text', timestamp: String(msg.messageTimestamp ?? ''), text: { body: text } };

	return { from, id, type: 'unsupported', timestamp: String(msg.messageTimestamp ?? '') };
}

function extensionFor(mimeType: string | undefined, filename: string | undefined): string {
	if (mimeType && MIME_TO_EXT[mimeType]) return MIME_TO_EXT[mimeType];
	const fromName = filename?.split('.').pop()?.toLowerCase();
	if (fromName && Object.values(MIME_TO_EXT).includes(fromName)) return fromName;
	return 'jpg';
}

export function createBaileysTransport(): WhatsAppTransport {
	let sock: WASocket | null = null;
	let handler: WhatsAppInboundHandler | null = null;
	let stopping = false;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function report(err: unknown, where: string): void {
		console.error(`[whatsapp-baileys] ${where}:`, err);
	}

	async function flag(key: string, value: string): Promise<void> {
		await setFlag(key, value).catch((err) => report(err, `flag ${key}`));
	}

	async function dispatch(msg: WhatsAppInboundMessage): Promise<void> {
		if (!handler) return;
		if (!(await whatsappBotEnabled())) {
			console.info('[whatsapp-baileys] bot switched off — dropping inbound message');
			return;
		}
		await handler(msg);
	}

	async function connect(): Promise<void> {
		const { state, saveCreds } = await usePostgresAuthState();

		sock = makeWASocket({
			auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silentLogger) },
			logger: silentLogger,
			browser: Browsers.ubuntu('Mise en Place'),
			markOnlineOnConnect: false,
			syncFullHistory: false,
		});

		sock.ev.on('creds.update', () => { void saveCreds().catch((err) => report(err, 'creds.update')); });

		sock.ev.on('connection.update', (update) => {
			const { qr, connection, lastDisconnect } = update;

			if (qr) {
				qrTerminal.generate(qr, { small: true });
				void flag(WHATSAPP_QR_FLAG, qr);
				void flag(WHATSAPP_STATUS_FLAG, 'pairing');
			}

			if (connection === 'open') {
				console.info('[whatsapp-baileys] connected');
				void flag(WHATSAPP_QR_FLAG, '');
				void flag(WHATSAPP_STATUS_FLAG, 'ready');
			}

			if (connection === 'close') {
				const status = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
					?.output?.statusCode;
				const loggedOut = status === DisconnectReason.loggedOut;
				void flag(WHATSAPP_STATUS_FLAG, loggedOut ? 'logged_out' : 'reconnecting');
				if (loggedOut) {
					console.error('[whatsapp-baileys] logged out — scan the QR again from /admin');
					return;
				}
				if (stopping) return;
				reconnectTimer = setTimeout(() => {
					void connect().catch((err) => report(err, 'reconnect'));
				}, RECONNECT_DELAY_MS);
			}
		});

		sock.ev.on('messages.upsert', (upsert) => {
			if (upsert.type !== 'notify' || !handler) return;
			for (const raw of upsert.messages) {
				const msg = toInbound(raw);
				if (!msg) continue;
				void dispatch(msg).catch((err) => report(err, `handling message ${msg.id}`));
			}
		});
	}

	return {
		async start() {
			stopping = false;
			await connect();
		},

		async stop() {
			stopping = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			try {
				sock?.end(undefined);
			} catch (err) {
				report(err, 'stop');
			}
			sock = null;
		},

		onMessage(cb) {
			handler = cb;
		},

		async sendText(to: string, body: string) {
			if (!sock) throw new Error('[whatsapp-baileys] socket is not connected');
			await sock.sendMessage(`${to}@s.whatsapp.net`, { text: body });
		},

		async downloadMedia(ref: WhatsAppMediaRef): Promise<WhatsAppDownloadedMedia> {
			const msg = ref.payload as WAMessage | undefined;
			if (!msg) throw new Error('[whatsapp-baileys] media reference carries no message');
			const buffer = await downloadMediaMessage(msg, 'buffer', {});
			return { buffer, extension: extensionFor(ref.mime_type, ref.filename) };
		},
	};
}
