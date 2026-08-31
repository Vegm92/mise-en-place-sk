/**
 * The help page (issue #569).
 *
 * The page renders its getting-started steps, feature tips and FAQ from the
 * lists in `src/lib/help-content.ts`, so every key it resolves is assembled at
 * runtime (`$t(`help.faq.${item}.q`)`). `lint:i18n` skips those — it can only
 * resolve literal keys — which is exactly the gap `docs/04_engineering/
 * coding_conventions.md` says to cover with a test derived from the same
 * source. `helpContentKeys()` is that derivation: it walks the real content
 * lists, so adding a step, tip or question without copy in both locales fails
 * here rather than rendering a raw key in the UI.
 *
 * The rest holds the page's contract with the shell: it is reachable from the
 * sidebar, it names itself through `nav.help`, and it links the tutorial API
 * (`src/routes/(app)/api/tutorial/`) via the tutorial store rather than
 * duplicating the fetch.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { get } from 'svelte/store';
import { locale, t, translations, loadAllMessages } from '../src/lib/i18n';
import { HELP_STEPS, HELP_TIPS, HELP_FAQ, helpContentKeys } from '../src/lib/help-content';
import { ROUTE_POLICY } from '../src/lib/server/entitlements';

await loadAllMessages();

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE = read('src/routes/(app)/help/+page.svelte');
const PAGE_LOAD = read('src/routes/(app)/help/+page.ts');
const SHELL = read('src/routes/(app)/+layout.svelte');
const SETTINGS = read('src/routes/(app)/settings/+page.svelte');

describe('help content covers what the issue asks for', () => {
	it('has a four-step getting-started guide ending in the saved invoice', () => {
		expect(HELP_STEPS.map((s) => s.key)).toEqual(['upload', 'review', 'confirm', 'insights']);
	});

	it('documents at least four feature areas', () => {
		expect(HELP_TIPS.length).toBeGreaterThanOrEqual(4);
		for (const key of ['analytics', 'budgets', 'reminders', 'suppliers', 'chat']) {
			expect(HELP_TIPS.map((tip) => tip.key)).toContain(key);
		}
	});

	it('points every tip at a route the app actually serves', () => {
		const routes = new Set(Object.keys(ROUTE_POLICY).map((id) => id.replace('/(app)', '')));
		for (const tip of HELP_TIPS) expect(routes.has(tip.href), `${tip.href} is not a route`).toBe(true);
		for (const step of HELP_STEPS) {
			if (step.href) expect(routes.has(step.href), `${step.href} is not a route`).toBe(true);
		}
	});

	it('answers at least four common questions', () => {
		expect(HELP_FAQ.length).toBeGreaterThanOrEqual(4);
	});
});

describe('every help string resolves in both locales', () => {
	const keys = [
		...helpContentKeys(),
		'nav.help',
		'help.intro',
		'help.step',
		'help.start.title',
		'help.start.sub',
		'help.tour.title',
		'help.tour.body',
		'help.tour.btn',
		'help.tips.title',
		'help.tips.sub',
		'help.faq.title',
		'help.more.title',
		'help.more.body',
		'help.more.settings',
		'set.helpLink',
		'set.helpLinkBody',
	];

	it.each(keys)('%s has Spanish copy', (key) => {
		expect((translations.es as Record<string, string>)[key], `${key} missing from es`).toBeTruthy();
	});

	it.each(keys)('%s has English copy', (key) => {
		expect((translations.en as Record<string, string>)[key], `${key} missing from en`).toBeTruthy();
	});

	it('resolves rather than echoing the key back', () => {
		for (const l of ['es', 'en'] as const) {
			locale.set(l);
			for (const key of keys) expect(get(t)(key)).not.toBe(key);
		}
		locale.set('es');
	});
});

describe('the page is wired into the shell', () => {
	it('titles itself through the shared nav key', () => {
		expect(PAGE_LOAD).toContain("title: 'nav.help'");
	});

	it('is classified in the entitlement policy as open', () => {
		expect((ROUTE_POLICY as Record<string, unknown>)['/(app)/help']).toBe('open');
	});

	it('is reachable from the sidebar and from settings', () => {
		expect(SHELL).toContain('href="/help"');
		expect(SHELL).toContain("$t('nav.help')");
		expect(SETTINGS).toContain('href="/help"');
	});

	it('renders each content list rather than hard-coding the entries', () => {
		expect(PAGE).toContain("from '$lib/help-content'");
		expect(PAGE).toContain('{#each HELP_STEPS as step');
		expect(PAGE).toContain('{#each HELP_TIPS as tip');
		expect(PAGE).toContain('{#each HELP_FAQ as item');
	});
});

describe('the tip PRO chip stays neutral (ADR-026)', () => {
	// #718 fixed the same drift in the upgrade dialog: a PRO chip labels
	// state, not something to press, so it must use the neutral triple
	// (--mep-hover / --mep-fg-2 / --mep-border), never --mep-acc.
	const rule = PAGE.match(/\.help-tip-pro\s*\{([^}]*)\}/)?.[1] ?? '';

	it('finds the .help-tip-pro rule', () => {
		expect(rule).not.toBe('');
	});

	it('never spells it with --mep-acc', () => {
		expect(rule).not.toMatch(/--mep-acc/);
	});

	it('uses the neutral background/color/border triple', () => {
		expect(rule).toMatch(/background:\s*var\(--mep-hover\)/);
		expect(rule).toMatch(/color:\s*var\(--mep-fg-2\)/);
		expect(rule).toMatch(/border:\s*1px solid var\(--mep-border\)/);
	});
});

describe('the tutorial API is linked', () => {
	it('starts the guided tour through the tutorial store', () => {
		expect(PAGE).toContain("from '$lib/stores/tutorial'");
		expect(PAGE).toContain("setTutorialStep('3')");
	});

	it('the store it calls posts to the tutorial endpoint', () => {
		expect(read('src/lib/stores/tutorial.ts')).toContain("'/api/tutorial'");
	});

	it("the step it starts at is one the endpoint accepts and the tour renders", () => {
		expect(read('src/routes/(app)/api/tutorial/+server.ts')).toContain("'3'");
		expect(read('src/lib/tour-gating.ts')).toContain("step: '3'");
	});
});
