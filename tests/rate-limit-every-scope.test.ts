/**
 * Every rate-limit scope in src/ still blocks at N+1 on the in-memory store.
 *
 * Each row pins the scope's max/window to the source text that sets it, then
 * drives the real limiter: N calls pass, call N+1 is refused. The discovery
 * test fails when a scope is added to src/ without a row here, so a new or
 * loosened limit cannot slip past unpinned.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkRateLimit } from '../src/lib/server/rate-limiter';

type Pin = [file: string, snippet: string];
type Row = { id: string; max: number; windowSeconds: number; pins: Pin[] };

const M = 60;
const H = 3600;
const r = (id: string, max: number, windowSeconds: number, ...pins: Pin[]): Row => ({ id, max, windowSeconds, pins });
const scoped = (id: string, max: number | string, file: string, ...more: string[]): Pin[] =>
	[file, ...more].map((f) => [f, `name: '${id}', max: ${max}`]);

const ROWS: Row[] = [
	r('login:ip', 10, M, ['src/routes/login/+page.server.ts', 'key: `login:ip:${ip}`, max: 10']),
	r('login:email', 5, M, ['src/routes/login/+page.server.ts', 'key: `login:email:${email.toLowerCase()}`, max: 5']),
	r('signup:ip', 5, M, ['src/routes/signup/+page.server.ts', 'key: `signup:ip:${ip}`, max: 5']),
	r('recover:ip', 5, M, ['src/routes/forgot-password/+page.server.ts', 'key: `recover:ip:${ip}`, max: 5']),
	r('recover:email', 3, M, ['src/routes/forgot-password/+page.server.ts', 'key: `recover:email:${email}`, max: 3']),
	r('reset:ip', 5, M, ['src/routes/reset-password/+page.server.ts', 'key: `reset:ip:${ip}`, max: 5']),
	r('reset:email', 5, M, ['src/routes/reset-password/+page.server.ts', 'key: `reset:email:${email}`, max: 5']),
	r('verify:ip', 10, M, ['src/routes/verify-email/+page.server.ts', 'key: `verify:ip:${ip}`, max: 10']),
	r('verify:email', 5, M, ['src/routes/verify-email/+page.server.ts', 'key: `verify:email:${email}`, max: 5']),
	r('waitlist', 5, M, ['src/lib/server/waitlist-join-action.ts', 'key: `waitlist:${ip}`, max: 5']),
	r('login:resend', 3, M, ['src/routes/login/+page.server.ts', "keyPrefix: 'login'"], ['src/lib/server/resend-verification-action.ts', '`${options.keyPrefix}:resend:${ip}`, 3)']),
	r('signup:resend', 3, M, ['src/routes/signup/+page.server.ts', "keyPrefix: 'signup'"], ['src/lib/server/resend-verification-action.ts', '`${options.keyPrefix}:resend:${ip}`, 3)']),
	r('email-change', 5, M, ['src/lib/server/account-security.ts', 'checkRateLimit(`email-change:user:${user.id}`, 5)'], ['src/lib/server/account-security.ts', 'checkRateLimit(`email-change:address:${email}`, 5)']),
	r('whatsapp-pair', 5, H, ['src/lib/server/whatsapp-pairing.ts', 'const REDEEM_ATTEMPTS = 5;'], ['src/lib/server/whatsapp-pairing.ts', 'const REDEEM_WINDOW_S = 60 * 60;'], ['src/lib/server/whatsapp-pairing.ts', 'checkRateLimit(`whatsapp-pair:${sender.phone}`, REDEEM_ATTEMPTS, REDEEM_WINDOW_S)']),
	r('whatsapp-pair-redeem', 100, H, ['src/lib/server/whatsapp-pairing.ts', 'const REDEEM_GLOBAL_LIMIT = 100;'], ['src/lib/server/whatsapp-pairing.ts', "checkRateLimit('whatsapp-pair-redeem', REDEEM_GLOBAL_LIMIT, REDEEM_WINDOW_S)"]),
	r('whatsapp-pair-gen', 10, H, ['src/lib/server/whatsapp-pairing.ts', 'const GENERATE_LIMIT = 10;'], ['src/lib/server/whatsapp-pairing.ts', 'const GENERATE_WINDOW_S = 60 * 60;'], ['src/lib/server/whatsapp-pairing.ts', "name: 'whatsapp-pair-gen', max: GENERATE_LIMIT, windowSeconds: GENERATE_WINDOW_S"]),
	r('whatsapp', 30, H, ['src/lib/server/env.ts', "process.env.WHATSAPP_SENDER_HOURLY_LIMIT ?? '30'"], ['src/lib/server/integrations/whatsapp/message-handler.ts', 'const SENDER_WINDOW_S = 60 * 60;'], ['src/lib/server/integrations/whatsapp/message-handler.ts', 'checkRateLimit(`whatsapp:${msg.from}`, WHATSAPP_SENDER_HOURLY_LIMIT, SENDER_WINDOW_S)']),
	r('whatsapp-unauth', 1, 6 * H, ['src/lib/server/integrations/whatsapp/message-handler.ts', 'const UNAUTHORIZED_REPLY_COOLDOWN_S = 6 * 60 * 60;'], ['src/lib/server/integrations/whatsapp/message-handler.ts', 'checkRateLimit(`whatsapp-unauth:${from}`, 1, UNAUTHORIZED_REPLY_COOLDOWN_S)']),
	r('api-global', 300, M, ['src/lib/server/request-policy.ts', "process.env.API_GLOBAL_RATE_LIMIT ?? '300'"], ['src/lib/server/request-policy.ts', 'checkRateLimit(`api-global:${subject}`, API_GLOBAL_RATE_LIMIT)']),
	r('health', 60, M, ['src/lib/server/env.ts', "process.env.HEALTH_RATE_LIMIT_RPM ?? '60'"], ['src/routes/api/health/+server.ts', 'checkRateLimit(`health:${ip}`, HEALTH_RATE_LIMIT_RPM)']),
	r('cookie-consent', 30, M, ['src/routes/cookie-consent/+server.ts', 'checkRateLimit(`cookie-consent:${ip}`, 30)']),
	r('digest-share-view', 30, M, ['src/lib/server/env.ts', "process.env.DIGEST_SHARE_VIEW_RATE_LIMIT_RPM ?? '30'"], ['src/routes/s/[token]/+page.server.ts', 'checkRateLimit(`digest-share-view:${ip}`, DIGEST_SHARE_VIEW_RATE_LIMIT_RPM)']),
	r('digest-share-og', 30, M, ['src/routes/s/[token]/og.png/+server.ts', 'checkRateLimit(`digest-share-og:${ip}`, DIGEST_SHARE_VIEW_RATE_LIMIT_RPM)']),
	r('chat', 20, M, ['src/lib/server/env.ts', "process.env.CHAT_RATE_LIMIT_RPM ?? '20'"], ...scoped('chat', 'CHAT_RATE_LIMIT_RPM', 'src/routes/(app)/api/chat/+server.ts')),
	r('upload', 10, M, ...scoped('upload', 10, 'src/routes/(app)/+page.server.ts', 'src/lib/server/email-ingest.ts')),
	r('batch-status', 60, M, ...scoped('batch-status', 60, 'src/routes/api/batch-status/[id]/+server.ts')),
	r('upload-file-download', 60, M, ...scoped('upload-file-download', 60, 'src/routes/api/upload/[id]/[file]/+server.ts')),
	r('password-change', 5, M, ...scoped('password-change', 5, 'src/lib/server/account-security.ts')),
	r('account-delete', 3, M, ...scoped('account-delete', 3, 'src/routes/api/user/delete/+server.ts')),
	r('account-export', 5, M, ...scoped('account-export', 5, 'src/routes/api/user/export/+server.ts')),
	r('switch-restaurant', 30, M, ...scoped('switch-restaurant', 30, 'src/routes/(app)/api/active-restaurant/+server.ts')),
	r('notifications', 60, M, ...scoped('notifications', 60, 'src/routes/(app)/api/notifications/+server.ts')),
	r('product-alias', 60, M, ...scoped('product-alias', 60, 'src/routes/(app)/api/product-aliases/+server.ts')),
	r('sidebar-settings', 30, M, ...scoped('sidebar-settings', 30, 'src/routes/(app)/api/sidebar/+server.ts')),
	r('sidebar', 60, M, ...scoped('sidebar', 60, 'src/routes/(app)/api/sidebar/+server.ts')),
	r('stock-levels', 60, M, ...scoped('stock-levels', 60, 'src/routes/(app)/api/stock-levels/+server.ts')),
	r('supplier-category', 60, M, ...scoped('supplier-category', 60, 'src/routes/(app)/api/supplier-category/+server.ts')),
	r('tutorial', 60, M, ...scoped('tutorial', 60, 'src/routes/(app)/api/tutorial/+server.ts')),
	r('unit-conversions', 30, M, ...scoped('unit-conversions', 30, 'src/routes/(app)/api/unit-conversions/+server.ts')),
	r('analytics-corrections-export', 5, M, ...scoped('analytics-corrections-export', 5, 'src/routes/(app)/analytics/extraction/csv/+server.ts')),
	r('invoice-relink', 20, M, ...scoped('invoice-relink', 20, 'src/routes/(app)/invoice/[id]/+page.server.ts')),
	r('invoice-claim', 20, M, ...scoped('invoice-claim', 20, 'src/routes/(app)/invoice/[id]/+page.server.ts')),
	r('invoice-edit-save', 30, M, ...scoped('invoice-edit-save', 30, 'src/routes/(app)/invoice/[id]/edit/+page.server.ts')),
	r('invoice-file-download', 60, M, ...scoped('invoice-file-download', 60, 'src/routes/(app)/invoice/[id]/file/+server.ts')),
	r('bulk', 10, M, ...scoped('bulk', 10, 'src/routes/(app)/invoices/+page.server.ts')),
	r('invoices-download-export', 5, M, ...scoped('invoices-download-export', 5, 'src/routes/(app)/invoices/export/download/+server.ts')),
	r('product-create', 30, M, ...scoped('product-create', 30, 'src/routes/(app)/products/+page.server.ts')),
	r('inventory-template', 10, M, ...scoped('inventory-template', 10, 'src/routes/(app)/products/inventory-template/+server.ts')),
	r('product-alias-manual', 60, M, ...scoped('product-alias-manual', 60, 'src/routes/(app)/products/[id]/+page.server.ts')),
	r('product-unlink', 30, M, ...scoped('product-unlink', 30, 'src/routes/(app)/products/[id]/+page.server.ts')),
	r('product-delete', 20, M, ...scoped('product-delete', 20, 'src/routes/(app)/products/[id]/+page.server.ts')),
	r('recipe-create', 30, M, ...scoped('recipe-create', 30, 'src/routes/(app)/recipes/+page.server.ts', 'src/routes/(app)/recipes/[id]/+page.server.ts')),
	r('recipe-csv-export', 10, M, ...scoped('recipe-csv-export', 10, 'src/routes/(app)/recipes/[id]/csv/+server.ts')),
	r('recipe-email', 10, H, ['src/routes/(app)/recipes/[id]/sheet/+page.server.ts', "name: 'recipe-email', max: 10, windowSeconds: 3600"]),
	r('reminders-review', 30, M, ...scoped('reminders-review', 30, 'src/routes/(app)/reminders/+page.server.ts')),
	r('digest-share-create', 20, M, ...scoped('digest-share-create', 20, 'src/routes/(app)/reports/[type]/+page.server.ts')),
	r('digest-share-revoke', 20, M, ...scoped('digest-share-revoke', 20, 'src/routes/(app)/reports/[type]/+page.server.ts')),
	r('report-export-csv', 10, M, ...scoped('report-export-csv', 10, 'src/routes/(app)/reports/[type]/csv/+server.ts')),
];

function walk(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		return e.isDirectory() ? walk(p) : /\.(ts|js|svelte)$/.test(e.name) ? [p] : [];
	});
}

function discoveredScopes(): Set<string> {
	const ids = new Set<string>();
	for (const file of walk(path.join(process.cwd(), 'src'))) {
		const src = fs.readFileSync(file, 'utf8');
		for (const m of src.matchAll(/rateLimitScoped\(\s*\{\s*scope: '\w+', name: '([\w-]+)'/g)) ids.add(String(m[1]));
		for (const m of src.matchAll(/checkRateLimit\(\s*[`']([\w-]+)/g)) ids.add(String(m[1]));
		for (const m of src.matchAll(/keyPrefix: '([\w-]+)'/g)) ids.add(`${String(m[1])}:resend`);
		if (src.includes('limits:')) {
			for (const m of src.matchAll(/key: `([\w-]+(?::(?:ip|email))?):\$\{/g)) ids.add(String(m[1]));
		}
	}
	return ids;
}

describe('every rate-limit scope blocks at N+1 on the in-memory store', () => {
	it('has a row for every scope in src/, and no row for a scope that is gone', () => {
		expect([...discoveredScopes()].sort()).toEqual(ROWS.map((row) => row.id).sort());
	});

	it.each(ROWS)('$id: source still sets max $max per $windowSeconds s', ({ pins }) => {
		for (const [file, snippet] of pins) {
			expect(fs.readFileSync(path.join(process.cwd(), file), 'utf8'), file).toContain(snippet);
		}
	});

	it.each(ROWS)('$id: allows $max, refuses call $max + 1', async ({ id, max, windowSeconds }) => {
		const key = `${id}:${randomUUID()}`;
		for (let i = 0; i < max; i++) expect(await checkRateLimit(key, max, windowSeconds)).toBe(true);
		expect(await checkRateLimit(key, max, windowSeconds)).toBe(false);
	});
});
