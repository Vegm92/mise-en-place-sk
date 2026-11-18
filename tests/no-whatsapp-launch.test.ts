/**
 * Launch without WhatsApp: the free/demo launch ships with every WhatsApp surface
 * switched off behind the master flag WHATSAPP_ENABLED (default off). The Meta
 * credentials or WHATSAPP_BOT_ENABLED alone must not turn anything on.
 *
 * Contract: /home/vg/WarRoom/reports/contract-no-whatsapp.md (checks 1, 2, 2b, 3, 5, 5b, 6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { translations } from '../src/lib/i18n-messages';

const ROOT = path.resolve(__dirname, '..');
const WA_RE = /whats\s?app|baileys|wa\.me/i;

const KEY_ALLOWLIST: RegExp[] = [
	/^set\.whatsapp\./,
	/^set\.nav\.whatsapp$/,
	/^set\.sub\.whatsapp$/,
	/^admin\.whatsapp\./,
	/^wa\./,
	/^notif\.msg\.whatsapp/,
	/^saved\.whatsapp$/,
];

const PUBLIC_PATHS = [
	'src/routes/waitlist', 'src/routes/privacy', 'src/routes/terms', 'src/routes/cookies', 'src/routes/legal',
	'src/routes/refunds', 'src/routes/login', 'src/routes/signup', 'src/routes/onboarding', 'src/routes/pending',
	'src/routes/forgot-password', 'src/routes/reset-password', 'src/routes/verify-email', 'src/routes/cookie-consent',
	'src/routes/l', 'src/routes/s', 'src/routes/sitemap.xml', 'src/routes/robots.txt',
	'src/lib/components/landing', 'src/lib/components/waitlist', 'src/lib/content/legal', 'static',
];

function walk(p: string): string[] {
	const st = statSync(p);
	if (st.isFile()) return [p];
	return readdirSync(p).flatMap((n) => walk(path.join(p, n)));
}

const TEXT_EXT = /\.(svelte|ts|js|json|html|txt|xml|md|css|svg|webmanifest)$/;

describe('check 1: no WhatsApp copy in public-facing text', () => {
	for (const loc of ['es', 'en'] as const) {
		it(`${loc} i18n: no value outside the allowlist mentions WhatsApp`, () => {
			const dict = translations[loc] as Record<string, string>;
			const offenders = Object.entries(dict)
				.filter(([k, v]) => typeof v === 'string' && WA_RE.test(v) && !KEY_ALLOWLIST.some((r) => r.test(k)))
				.map(([k]) => k);
			expect(offenders).toEqual([]);
		});
	}

	it('every scanned public path exists (a missing path is an error, not zero hits)', () => {
		const missing = [...PUBLIC_PATHS, ...readdirSync(path.join(ROOT, 'src/lib/server')).filter((f) => /^email.*\.ts$/.test(f)).map((f) => `src/lib/server/${f}`)]
			.filter((p) => !existsSync(path.join(ROOT, p)));
		expect(missing).toEqual([]);
	});

	it('public routes, landing components, legal content, email templates and static assets have no WhatsApp text', () => {
		const emailFiles = readdirSync(path.join(ROOT, 'src/lib/server')).filter((f) => /^email.*\.ts$/.test(f)).map((f) => `src/lib/server/${f}`);
		const hits: string[] = [];
		for (const rel of [...PUBLIC_PATHS, ...emailFiles]) {
			for (const file of walk(path.join(ROOT, rel))) {
				if (!TEXT_EXT.test(file)) continue;
				const text = readFileSync(file, 'utf8');
				if (WA_RE.test(text)) hits.push(path.relative(ROOT, file));
			}
		}
		expect(hits).toEqual([]);
	});
});

describe('E7: single definition of the master flag', () => {
	it('src has one `export const WHATSAPP_ENABLED` (env.ts) and the old constant is WHATSAPP_CONFIGURED', () => {
		const defs: string[] = [];
		for (const file of walk(path.join(ROOT, 'src'))) {
			if (!/\.(ts|svelte)$/.test(file)) continue;
			if (/export const WHATSAPP_ENABLED\b/.test(readFileSync(file, 'utf8'))) defs.push(path.relative(ROOT, file));
		}
		expect(defs).toEqual(['src/lib/server/env.ts']);
		expect(readFileSync(path.join(ROOT, 'src/lib/server/whatsapp-settings.ts'), 'utf8')).toMatch(/export const WHATSAPP_CONFIGURED/);
	});
});

function setEnv(env: Record<string, string | undefined>) {
	for (const k of ['WHATSAPP_ENABLED', 'WHATSAPP_BOT_ENABLED', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_DISPLAY_NUMBER']) {
		if (env[k] === undefined) vi.stubEnv(k, ''); else vi.stubEnv(k, env[k]!);
	}
}

const CREDS = { WHATSAPP_ACCESS_TOKEN: 'fake-token', WHATSAPP_PHONE_NUMBER_ID: '123456' };

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.doUnmock('pg-boss'); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.doUnmock('../src/lib/server/app-flags'); vi.doUnmock('../src/lib/server/whatsapp-contacts'); vi.doUnmock('../src/lib/server/whatsapp-pairing'); vi.doUnmock('../src/lib/server/restaurant-admin'); });

describe('check 2: the Baileys transport is not started by default', () => {
	async function load() {
		vi.doMock('../src/lib/server/app-flags', () => ({ getFlag: vi.fn().mockResolvedValue(null), setFlag: vi.fn() }));
		const cfg = await import('../src/lib/server/integrations/whatsapp/whatsapp-config');
		return cfg;
	}

	it('flag unset: not enabled', async () => {
		setEnv({});
		const cfg = await load();
		expect(cfg.whatsappFeatureEnabled()).toBe(false);
		expect(await cfg.whatsappBotEnabled()).toBe(false);
	});

	it('WHATSAPP_BOT_ENABLED=true without the master flag: still off', async () => {
		setEnv({ WHATSAPP_BOT_ENABLED: 'true' });
		const cfg = await load();
		expect(await cfg.whatsappBotEnabled()).toBe(false);
		const rt = await import('../src/lib/server/integrations/whatsapp/runtime');
		expect(await rt.startWhatsAppTransport()).toBeNull();
	});

	it('both on: enabled (reversible)', async () => {
		setEnv({ WHATSAPP_BOT_ENABLED: 'true', WHATSAPP_ENABLED: 'true' });
		const cfg = await load();
		expect(await cfg.whatsappBotEnabled()).toBe(true);
	});

	it('anything other than "true" is off', async () => {
		setEnv({ WHATSAPP_BOT_ENABLED: 'true', WHATSAPP_ENABLED: '1' });
		const cfg = await load();
		expect(cfg.whatsappFeatureEnabled()).toBe(false);
	});
});

describe('check 2b: queues and jobs', () => {
	async function worker(env: Record<string, string>) {
		setEnv(env);
		vi.doMock('../src/lib/server/app-flags', () => ({ getFlag: vi.fn().mockResolvedValue(null), setFlag: vi.fn() }));
		const transport = { onMessage: vi.fn(), stop: vi.fn(), start: vi.fn().mockResolvedValue(undefined) };
		vi.doMock('../src/lib/server/integrations/whatsapp/driver-baileys', () => ({ createBaileysTransport: () => transport }));
		const mod = await import('../src/lib/server/integrations/whatsapp/worker-registration');
		const boss = { work: vi.fn().mockResolvedValue('id') };
		const started = await mod.startWhatsAppWorker(boss);
		return { boss, started, transport };
	}

	it('flag off: no boss.work registration and no transport, even with BOT_ENABLED=true', async () => {
		const { boss, started } = await worker({ WHATSAPP_BOT_ENABLED: 'true' });
		expect(started).toBeNull();
		expect(boss.work).not.toHaveBeenCalled();
	});

	it('flag on: the notify worker registers and the transport starts', async () => {
		const { boss, started, transport } = await worker({ WHATSAPP_BOT_ENABLED: 'true', WHATSAPP_ENABLED: 'true' });
		expect(started).toBe(transport);
		expect(boss.work).toHaveBeenCalledTimes(1);
		expect(boss.work.mock.calls[0]![0]).toBe('whatsapp-notify');
	});

	async function queue(env: Record<string, string>) {
		setEnv(env);
		const send = vi.fn().mockResolvedValue('job-1');
		vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/fake');
		vi.doMock('pg-boss', () => ({
			PgBoss: vi.fn(function () {
				return { start: vi.fn().mockResolvedValue(undefined), createQueue: vi.fn().mockResolvedValue(undefined), updateQueue: vi.fn().mockResolvedValue(undefined), send };
			}),
		}));
		const q = await import('../src/lib/server/queue');
		return { q, send };
	}

	it('flag off: enqueueWhatsAppNotify sends nothing', async () => {
		const { q, send } = await queue({});
		expect(await q.enqueueWhatsAppNotify('item', 'rest', 'req')).toBe(false);
		expect(send).not.toHaveBeenCalled();
	});

	it('flag on: enqueueWhatsAppNotify sends to the notify queue', async () => {
		const { q, send } = await queue({ WHATSAPP_ENABLED: 'true' });
		expect(await q.enqueueWhatsAppNotify('item', 'rest', 'req')).toBe(true);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0]![0]).toBe('whatsapp-notify');
	});

	it('flag off: the weekly digest push contacts nobody and queries nothing', async () => {
		setEnv({ ...CREDS });
		const contacts = vi.fn().mockResolvedValue([{ id: 1, phoneNumber: '+34600000000' }]);
		const send = vi.fn();
		vi.doMock('../src/lib/server/whatsapp-contacts', () => ({ digestOptedInContacts: contacts, isDigestOptedIn: vi.fn().mockResolvedValue(true) }));
		vi.doMock('../src/lib/server/whatsapp', () => ({ sendWhatsAppMessage: send }));
		vi.doMock('../src/lib/server/digest-share', () => ({ getOrCreateActiveShare: vi.fn().mockResolvedValue({ token: 't' }) }));
		const mod = await import('../src/lib/server/whatsapp-digest-push');
		await mod.pushWeeklyDigestOverWhatsApp('r', 'name', '2026-W46', 'digest');
		expect(contacts).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});
});

describe('check 3: settings has no WhatsApp option, even with Meta credentials present', () => {
	async function settings(env: Record<string, string>) {
		setEnv(env);
		const contacts = { listContacts: vi.fn().mockResolvedValue([]), removeContact: vi.fn() };
		const pairing = { activePairingCode: vi.fn().mockResolvedValue(null), generatePairingCode: vi.fn().mockResolvedValue({ ok: true }), revokePairingCodes: vi.fn() };
		const admin = { requireOwner: vi.fn().mockResolvedValue(true) };
		vi.doMock('../src/lib/server/whatsapp-contacts', () => contacts);
		vi.doMock('../src/lib/server/whatsapp-pairing', () => pairing);
		vi.doMock('../src/lib/server/restaurant-admin', () => admin);
		const mod = await import('../src/lib/server/whatsapp-settings');
		return { mod, contacts, pairing, admin };
	}

	it('flag off + credentials set: panel disabled, nothing loaded, all four actions are 403 before any DB write', async () => {
		const { mod, contacts, pairing, admin } = await settings({ ...CREDS });
		expect(mod.WHATSAPP_CONFIGURED).toBe(true);
		expect(mod.whatsappPanelEnabled()).toBe(false);
		expect(await mod.loadWhatsappPanel('r')).toEqual({ contacts: [], pairingCode: null });
		const form = new FormData();
		form.set('phone', '+34600000000'); form.set('name', 'x'); form.set('id', '1');
		const results = [
			await mod.inviteWhatsappContact('r', 'u', form),
			await mod.releaseWhatsappContact('r', 'u', form),
			await mod.issuePairingCode('r', 'u', form),
			await mod.revokePairingCode('r', 'u'),
		];
		for (const r of results) expect(r).toMatchObject({ status: 403 });
		expect(admin.requireOwner).not.toHaveBeenCalled();
		expect(contacts.listContacts).not.toHaveBeenCalled();
		expect(contacts.removeContact).not.toHaveBeenCalled();
		expect(pairing.generatePairingCode).not.toHaveBeenCalled();
		expect(pairing.revokePairingCodes).not.toHaveBeenCalled();
		expect(pairing.activePairingCode).not.toHaveBeenCalled();
	});

	it('flag on, no credentials: still disabled (both gates are required)', async () => {
		const { mod } = await settings({ WHATSAPP_ENABLED: 'true' });
		expect(mod.whatsappPanelEnabled()).toBe(false);
	});

	it('check 6, reversibility: flag on + credentials: panel enabled and actions reach the domain code', async () => {
		const { mod, pairing } = await settings({ ...CREDS, WHATSAPP_ENABLED: 'true' });
		expect(mod.whatsappPanelEnabled()).toBe(true);
		const form = new FormData();
		form.set('name', 'x');
		const r = await mod.issuePairingCode('r', 'u', form);
		expect(r).not.toMatchObject({ status: 403 });
		expect(pairing.generatePairingCode).toHaveBeenCalledTimes(1);
	});
});

describe('check 5: admin surface', () => {
	it('flag off: layout reports whatsappEnabled=false and /admin/whatsapp is a 404 (load and actions)', async () => {
		setEnv({});
		vi.stubEnv('AUTH_ADMIN_EMAIL', 'admin@example.com');
		vi.doMock('../src/lib/server/app-flags', () => ({ getFlag: vi.fn().mockResolvedValue(null), setFlag: vi.fn() }));
		const layout = await import('../src/routes/(admin)/+layout.server');
		const data = await (layout.load as (e: unknown) => Promise<{ whatsappEnabled: boolean }>)({ locals: { user: { email: 'admin@example.com', id: 'a' } } });
		expect(data.whatsappEnabled).toBe(false);
		const page = await import('../src/routes/(admin)/admin/whatsapp/+page.server');
		await expect((page.load as () => Promise<unknown>)()).rejects.toMatchObject({ status: 404 });
		const form = { request: { formData: async () => new FormData() }, locals: { user: { id: 'a', email: 'admin@example.com' } } };
		for (const name of ['toggleBot', 'releaseContact'] as const) {
			await expect((page.actions[name] as (e: unknown) => Promise<unknown>)(form)).rejects.toMatchObject({ status: 404 });
		}
	});

	it('check 6: flag on: the admin page loads', async () => {
		setEnv({ WHATSAPP_ENABLED: 'true' });
		vi.doMock('../src/lib/server/app-flags', () => ({ getFlag: vi.fn().mockResolvedValue(null), setFlag: vi.fn() }));
		const page = await import('../src/routes/(admin)/admin/whatsapp/+page.server');
		await expect((page.load as () => Promise<unknown>)()).resolves.toMatchObject({ enabled: true });
	});
});

describe('check 5b: health has no WhatsApp rows and makes no Graph API call', () => {
	it('flag off + credentials set: no check named WhatsApp*, no fetch to graph.facebook.com', async () => {
		setEnv({ ...CREDS });
		const urls: string[] = [];
		const realFetch = globalThis.fetch;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const u = String(input instanceof Request ? input.url : input);
			urls.push(u);
			if (u.includes('graph.facebook.com')) throw new Error('unexpected Graph API call');
			return realFetch(input, init);
		});
		const health = await import('../src/lib/server/system-health');
		const result = await health.runSystemChecks();
		expect(result.checks.filter((c) => /^whatsapp/i.test(c.name))).toEqual([]);
		expect(result.whatsapp).toBeNull();
		expect(result.probes.whatsappCloud?.state ?? 'unconfigured').toBe('unconfigured');
		expect(urls.filter((u) => u.includes('graph.facebook.com'))).toEqual([]);
	}, 60_000);

	it('check 6: flag on + credentials: the WhatsApp rows and the Graph probe come back', async () => {
		setEnv({ ...CREDS, WHATSAPP_ENABLED: 'true' });
		const urls: string[] = [];
		const realFetch = globalThis.fetch;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const u = String(input instanceof Request ? input.url : input);
			urls.push(u);
			if (u.includes('graph.facebook.com')) throw new Error('blocked in test');
			return realFetch(input, init);
		});
		const health = await import('../src/lib/server/system-health');
		const result = await health.runSystemChecks();
		expect(result.checks.some((c) => /^whatsapp/i.test(c.name))).toBe(true);
		expect(urls.some((u) => u.includes('graph.facebook.com'))).toBe(true);
	}, 60_000);
});
