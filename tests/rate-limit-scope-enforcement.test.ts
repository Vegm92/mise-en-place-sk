/**
 * Issue #440 — audit-enforcement scan. Every authenticated checkRateLimit()
 * call site must go through rateLimitScoped() (src/lib/server/rate-limit-scope.ts)
 * so its identity choice ('tenant' vs 'user') is explicit and reviewable,
 * instead of a hand-written key prefix that silently picks one.
 *
 * A small set of call sites are deliberately NOT authenticated
 * tenant/user business actions and stay on checkRateLimit() directly — each
 * is named below with the reason, and each is checked to still actually be
 * there so the allowlist can't go stale silently:
 *
 * - src/lib/server/rate-limiter.ts — checkRateLimit()'s own definition, not a call site
 * - src/lib/server/rate-limit-scope.ts — rateLimitScoped()'s own sanctioned internal call
 * - src/lib/server/public-form-action.ts — the #510 public-form wrapper; unauthenticated, ip-scoped
 * - src/routes/signup/+page.server.ts — the resend action is ip-keyed inside a publicFormAction handler
 * - src/routes/api/health/+server.ts — health:ip, an unauthenticated public endpoint
 * - src/hooks.server.ts — api-global falls back between user and ip identity; a blanket
 *   gateway guard, not a single tenant/user business action
 * - src/lib/server/integrations/whatsapp/message-handler.ts — keyed by WhatsApp phone
 *   number, a channel identity with no Auth.js session
 * - src/lib/server/whatsapp-pairing.ts — redeemPairingCode() is phone-keyed (the
 *   generate side, restaurant-keyed, is migrated to rateLimitScoped())
 * - src/routes/(app)/settings/+page.server.ts — email-change is deliberately dual-keyed
 *   (user AND address, #496); password-change in the same file is migrated
 * - src/routes/login/+page.server.ts — the resend-verification action (#743) is
 *   ip-keyed and unauthenticated: there is no session identity to scope by yet
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.join(process.cwd(), 'src');

const DEFINITION_FILE = 'src/lib/server/rate-limiter.ts';

const ALLOWED_DIRECT_CALL_FILES = new Set([
	'src/lib/server/rate-limit-scope.ts',
	'src/lib/server/public-form-action.ts',
	'src/routes/signup/+page.server.ts',
	'src/routes/api/health/+server.ts',
	'src/hooks.server.ts',
	'src/lib/server/integrations/whatsapp/message-handler.ts',
	'src/lib/server/whatsapp-pairing.ts',
	'src/routes/(app)/settings/+page.server.ts',
	'src/routes/login/+page.server.ts',
]);

function walkTsFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkTsFiles(full));
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
			files.push(full);
		}
	}
	return files;
}

const sourceFiles = walkTsFiles(SRC_DIR);

describe('checkRateLimit() call sites go through rateLimitScoped() (issue #440)', () => {
	it('scanned a non-trivial number of source files', () => {
		expect(sourceFiles.length).toBeGreaterThan(100);
	});

	for (const file of sourceFiles) {
		const relPath = path.relative(process.cwd(), file).split(path.sep).join('/');
		const src = fs.readFileSync(file, 'utf8');
		if (!src.includes('checkRateLimit(')) continue;
		if (relPath === DEFINITION_FILE) continue;

		it(`${relPath} only calls checkRateLimit() directly if it is a documented exception`, () => {
			expect(
				ALLOWED_DIRECT_CALL_FILES.has(relPath),
				`${relPath} calls checkRateLimit() directly. Authenticated tenant/user business ` +
				`actions must route through rateLimitScoped() so the identity choice is explicit — ` +
				`see src/lib/server/rate-limit-scope.ts. If this really is a new exception (an ` +
				`unauthenticated or non-web-identity guard), add it to ALLOWED_DIRECT_CALL_FILES here ` +
				`with a reason, and to the ADR's exception list.`,
			).toBe(true);
		});
	}

	it('every documented exception still actually calls checkRateLimit() directly (keeps the allowlist from going stale)', () => {
		for (const relFile of ALLOWED_DIRECT_CALL_FILES) {
			const src = fs.readFileSync(path.join(process.cwd(), relFile), 'utf8');
			expect(
				src.includes('checkRateLimit('),
				`${relFile} no longer calls checkRateLimit() directly — remove it from ALLOWED_DIRECT_CALL_FILES`,
			).toBe(true);
		}
	});

	it('the authenticated call sites this issue fixed do route through rateLimitScoped() (sanity check against a silently-emptied scan)', () => {
		const mustUseHelper = [
			'src/routes/(app)/api/chat/+server.ts',
			'src/routes/(app)/api/unit-conversions/+server.ts',
			'src/routes/(app)/api/notifications/+server.ts',
			'src/routes/(app)/api/product-aliases/+server.ts',
			'src/routes/(app)/api/supplier-category/+server.ts',
			'src/routes/(app)/api/stock-levels/+server.ts',
			'src/routes/(app)/api/trend/+server.ts',
			'src/routes/(app)/api/active-restaurant/+server.ts',
			'src/routes/(app)/products/+page.server.ts',
			'src/routes/(app)/products/[id]/+page.server.ts',
			'src/routes/(app)/invoices/+page.server.ts',
			'src/routes/(app)/invoices/export/download/+server.ts',
			'src/routes/(app)/invoice/[id]/+page.server.ts',
			'src/routes/(app)/+page.server.ts',
			'src/routes/api/user/delete/+server.ts',
			'src/routes/api/user/export/+server.ts',
			'src/lib/server/whatsapp-pairing.ts',
			'src/routes/(app)/settings/+page.server.ts',
		];
		for (const relFile of mustUseHelper) {
			const src = fs.readFileSync(path.join(process.cwd(), relFile), 'utf8');
			expect(src, `${relFile} should import rateLimitScoped`).toMatch(/rateLimitScoped/);
		}
	});

	it('chat is tenant-scoped, not user-scoped — the primary #440 fix (paid Gemini capacity must not multiply per staff seat)', () => {
		const src = fs.readFileSync(path.join(process.cwd(), 'src/routes/(app)/api/chat/+server.ts'), 'utf8');
		const call = src.match(/rateLimitScoped\(\s*\{[^}]*\}/)?.[0] ?? '';
		expect(call).toMatch(/scope:\s*'tenant'/);
		expect(call).not.toMatch(/scope:\s*'user'/);
	});
});
