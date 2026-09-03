/**
 * The /chat locked-preview UI (issue #546).
 *
 * tests/chat-load.test.ts pins what the server returns; this pins that the
 * markup actually acts on it — the composer and the floating chat (ChatFab)
 * both refuse to submit while locked, and the nav lock affordance already
 * covers this feature (issue #567/#718 work), so nothing here duplicates
 * that. Source-scan, not component-mounted, matching this repo's precedent
 * for markup assertions (see tests/guided-tour.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const CHAT_PAGE = read('src/routes/(app)/chat/+page.svelte');
const CHAT_FAB  = read('src/lib/components/mep/ChatFab.svelte');
const SHELL     = read('src/routes/(app)/+layout.svelte');

describe('/chat composer refuses a submission it would 402 on (#546)', () => {
	it('disables the text input and send button when locked', () => {
		expect(CHAT_PAGE).toMatch(/disabled=\{chatLoading \|\| locked\}/);
		expect(CHAT_PAGE).toMatch(/disabled=\{!chatInput\.trim\(\) \|\| chatLoading \|\| locked\}/);
	});

	it('guards sendMessage itself, not just the button, against a locked submit', () => {
		expect(CHAT_PAGE).toContain('if (!msg || chatLoading || locked) return;');
	});

	it('offers an inline upgrade CTA to the billing page', () => {
		expect(CHAT_PAGE).toContain('/billing?upgrade=assistant');
		expect(CHAT_PAGE).toContain("t('chat.err.upgradeRequired')");
	});

	it('reads the locked flag off the load data', () => {
		expect(CHAT_PAGE).toContain('const locked = $derived(!!data.locked);');
	});
});

describe('ChatFab mirrors the locked state (#546)', () => {
	it('accepts a locked prop and guards sendMessage with it', () => {
		expect(CHAT_FAB).toContain("const { locked = false }: { locked?: boolean } = $props();");
		expect(CHAT_FAB).toContain('if (!msg || chatLoading || locked) return;');
	});

	it('disables its own input and send button when locked', () => {
		expect(CHAT_FAB).toMatch(/disabled=\{chatLoading \|\| locked\}/);
		expect(CHAT_FAB).toMatch(/disabled=\{!chatInput\.trim\(\) \|\| chatLoading \|\| locked\}/);
	});

	it('offers the same upgrade CTA as the full page', () => {
		expect(CHAT_FAB).toContain('/billing?upgrade=assistant');
	});

	it('is wired to the aiAssistant entitlement from the shell, the same source the nav lock icons read', () => {
		expect(SHELL).toContain('<ChatFab locked={!data.features.aiAssistant} />');
		expect(SHELL).toContain("feature: 'aiAssistant'");
	});
});
