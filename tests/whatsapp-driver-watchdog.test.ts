/**
 * Baileys connect watchdog.
 *
 * Found by running the worker for real against a blocked network: Baileys
 * emits `connection: 'connecting'` and then NOTHING — no QR, no error, no
 * close event. The worker logged "Listening for whatsapp-notify jobs", the
 * admin panel said "no data", and nothing anywhere said the socket was never
 * going to come up. A blocked egress, a DNS failure and a WhatsApp outage all
 * look identical from inside the process, so the driver has to time the
 * connection itself.
 *
 * This is the one place the repo mocks an SDK rather than a seam
 * (coding_conventions.md:143) — the driver IS the adapter to that SDK, so
 * there is no seam left underneath it to mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { socketMock, setFlagMock, emit, resetListeners } = vi.hoisted(() => {
	const listeners = new Map<string, Array<(payload: unknown) => void>>();
	return {
		setFlagMock: vi.fn().mockResolvedValue(undefined),
		socketMock: {
			ev: {
				on: (event: string, cb: (payload: unknown) => void) => {
					const list = listeners.get(event) ?? [];
					list.push(cb);
					listeners.set(event, list);
				},
			},
			end: vi.fn(),
			sendMessage: vi.fn().mockResolvedValue(undefined),
		},
		emit: (event: string, payload: unknown) => {
			for (const cb of listeners.get(event) ?? []) cb(payload);
		},
		resetListeners: () => listeners.clear(),
	};
});

vi.mock('@whiskeysockets/baileys', () => ({
	default: () => socketMock,
	Browsers: { ubuntu: () => ['x', 'y', 'z'] },
	DisconnectReason: { loggedOut: 401 },
	downloadMediaMessage: vi.fn(),
	getContentType: vi.fn(),
	jidNormalizedUser: (jid: string) => jid,
	makeCacheableSignalKeyStore: (keys: unknown) => keys,
}));
vi.mock('qrcode-terminal', () => ({ default: { generate: vi.fn() } }));
vi.mock('../src/lib/server/app-flags', () => ({ setFlag: setFlagMock, getFlag: vi.fn() }));
vi.mock('../src/lib/server/integrations/whatsapp/auth-state', () => ({
	usePostgresAuthState: async () => ({ state: { creds: {}, keys: {} }, saveCreds: vi.fn() }),
}));

import { createBaileysTransport } from '../src/lib/server/integrations/whatsapp/driver-baileys';

function flagValue(key: string): string | undefined {
	const call = [...setFlagMock.mock.calls].reverse().find((c) => c[0] === key);
	return call?.[1] as string | undefined;
}

beforeEach(() => {
	vi.clearAllMocks();
	resetListeners();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('connect watchdog', () => {
	it('reports the socket as unreachable when no QR and no connection ever arrive', async () => {
		const transport = createBaileysTransport();
		await transport.start();

		expect(flagValue('whatsapp_status')).toBe('connecting');

		emit('connection.update', { connection: 'connecting' });
		await vi.advanceTimersByTimeAsync(59_000);
		expect(flagValue('whatsapp_status')).toBe('connecting');

		await vi.advanceTimersByTimeAsync(2_000);
		expect(flagValue('whatsapp_status')).toBe('unreachable');
		expect(socketMock.end).toHaveBeenCalled();

		await transport.stop();
	});

	it('stays on "unreachable" across retries instead of flickering back to "connecting"', async () => {
		// Otherwise the panel shows the real state for 5 seconds in every 65 and
		// reads as "connecting" the rest of the time.
		const transport = createBaileysTransport();
		await transport.start();

		await vi.advanceTimersByTimeAsync(61_000);
		expect(flagValue('whatsapp_status')).toBe('unreachable');

		await vi.advanceTimersByTimeAsync(10_000);
		expect(flagValue('whatsapp_status')).toBe('unreachable');

		await transport.stop();
	});

	it('disarms the watchdog once a QR arrives', async () => {
		const transport = createBaileysTransport();
		await transport.start();

		emit('connection.update', { qr: 'qr-payload' });
		expect(flagValue('whatsapp_status')).toBe('pairing');

		await vi.advanceTimersByTimeAsync(120_000);
		expect(flagValue('whatsapp_status')).toBe('pairing');
		expect(socketMock.end).not.toHaveBeenCalled();

		await transport.stop();
	});

	it('disarms the watchdog once the connection opens', async () => {
		const transport = createBaileysTransport();
		await transport.start();

		emit('connection.update', { connection: 'open' });
		expect(flagValue('whatsapp_status')).toBe('ready');
		expect(flagValue('whatsapp_qr')).toBe('');

		await vi.advanceTimersByTimeAsync(120_000);
		expect(flagValue('whatsapp_status')).toBe('ready');
		expect(socketMock.end).not.toHaveBeenCalled();

		await transport.stop();
	});

	it('does not reconnect after stop()', async () => {
		const transport = createBaileysTransport();
		await transport.start();
		await transport.stop();

		emit('connection.update', { connection: 'close', lastDisconnect: { error: new Error('bye') } });
		await vi.advanceTimersByTimeAsync(120_000);

		expect(flagValue('whatsapp_status')).not.toBe('unreachable');
	});

	it('gives up rather than reconnecting when WhatsApp says logged out', async () => {
		const transport = createBaileysTransport();
		await transport.start();

		emit('connection.update', {
			connection: 'close',
			lastDisconnect: { error: Object.assign(new Error('gone'), { output: { statusCode: 401 } }) },
		});

		expect(flagValue('whatsapp_status')).toBe('logged_out');
		await vi.advanceTimersByTimeAsync(120_000);
		expect(flagValue('whatsapp_status')).toBe('logged_out');

		await transport.stop();
	});
});
