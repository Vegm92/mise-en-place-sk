/**
 * The guided tour after issue #569.
 *
 * Two things changed and both are easy to regress silently.
 *
 * 1. Copy. The tour used to carry its own `tour.step3..11` strings, written
 *    once and never revisited, saying much the same as the help centre in
 *    slightly different words. It now renders the help-centre copy directly,
 *    so the walkthrough and the documentation cannot drift: every tour page
 *    names a `help.tip.*` entry, and the tour walks exactly the section list
 *    the help page renders, in the same order. Nothing else enforces that
 *    pairing — the keys are assembled at runtime, so a missing one renders as
 *    a raw key inside the coach mark.
 *
 * 2. Theme. The coach mark and the two tour cards hard-coded their scrim,
 *    shadows, radii and type sizes, so they ignored the light/dark ramps and
 *    the MEP scale. They now read tokens. A hard-coded `rgba(...)` here is the
 *    specific regression: it looks right in whichever theme it was written for
 *    and wrong in the other, which is exactly what nobody notices in review.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { get } from 'svelte/store';
import { locale, t, translations } from '../src/lib/i18n';
import { TOUR_PAGES, TOUR_FEATURE_REQUIREMENT, tourPageAccessible } from '../src/lib/tour-gating';
import { HELP_TIPS } from '../src/lib/help-content';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const COACH = read('src/lib/components/mep/CoachMark.svelte');
const SHELL = read('src/routes/(app)/+layout.svelte');
const CSS = read('src/app.css');

describe('the tour renders the help-centre copy', () => {
	it('walks exactly the help page section list, in order', () => {
		expect(TOUR_PAGES.map((p) => p.tip)).toEqual(HELP_TIPS.map((tip) => tip.key));
	});

	it('resolves a title and a body for every step in both locales', () => {
		for (const lc of ['es', 'en'] as const) {
			locale.set(lc);
			for (const page of TOUR_PAGES) {
				for (const suffix of ['title', 'body']) {
					const key = `help.tip.${page.tip}.${suffix}`;
					expect(get(t)(key), `${key} missing from ${lc}`).not.toBe(key);
				}
			}
		}
		locale.set('es');
	});

	it('reads those keys from the tour page rather than a step number', () => {
		expect(SHELL).toContain('`help.tip.${activeTourPage.tip}.title`');
		expect(SHELL).toContain('`help.tip.${activeTourPage.tip}.body`');
		expect(SHELL).not.toMatch(/tour\.step\d/);
	});

	it('shows the review step the same guide copy, not a second version of it', () => {
		expect(SHELL).toContain("$t('help.start.review.title')");
		expect(SHELL).toContain("$t('help.start.review.body')");
	});

	it('keeps only chrome strings under the tour namespace', () => {
		for (const table of [translations.es, translations.en]) {
			const perStep = Object.keys(table).filter((k) => /^tour\.step\d/.test(k));
			expect(perStep, 'per-step tour copy is the help centre now').toEqual([]);
		}
		for (const key of ['tour.next.review', 'tour.next.finish', 'tour.complete.title', 'tour.nudge.title']) {
			expect(get(t)(key)).not.toBe(key);
		}
	});

	it('labels the last step as the end of the tour without hard-coding its number', () => {
		expect(SHELL).toContain('tourIndex === tourPages.length - 1');
		expect(SHELL).toContain("$t('tour.next.finish')");
	});

	it('starts the nudge at the first tour page rather than a literal step', () => {
		expect(SHELL).toContain('setTutorialStep(tourPages[0].step)');
	});
});

describe('the tour counts only the steps this plan can reach', () => {
	it('gates every tour page that its own loader gates', () => {
		for (const [path, feature] of [['/reports', 'weeklyDigest'], ['/chat', 'aiAssistant']] as const) {
			const loader = read(`src/routes/(app)${path}/+page.server.ts`);
			expect(loader, `${path} is expected to call requireFeature`).toContain(`requireFeature('${feature}'`);
			expect(
				TOUR_FEATURE_REQUIREMENT[path],
				`${path} would 403 mid-tour: register it in TOUR_FEATURE_REQUIREMENT`,
			).toBe(feature);
		}
	});

	it('drops the inaccessible pages before numbering the steps', () => {
		expect(SHELL).toContain('const tourPages = $derived(TOUR_PAGES.filter(p => tourPageAccessible(p.path, data.features)))');
		expect(SHELL).toContain('totalSteps={tourPages.length}');
		expect(SHELL).not.toContain('totalSteps={TOUR_PAGES.length}');
	});

	it('leaves a trial account a tour it can walk end to end', () => {
		const trial = { weeklyDigest: false, aiAssistant: false };
		const reachable = TOUR_PAGES.filter((p) => tourPageAccessible(p.path, trial));
		expect(reachable.map((p) => p.path)).not.toContain('/reports');
		expect(reachable.map((p) => p.path)).not.toContain('/chat');
		expect(reachable[reachable.length - 1].path).toBe('/settings');
	});

	it('tells the nudge how many steps there actually are', () => {
		expect(SHELL).toContain("$ti('tour.nudge.body', { n: tourPages.length })");
		for (const lc of ['es', 'en'] as const) {
			locale.set(lc);
			expect(get(t)('tour.nudge.body')).toContain('{n}');
		}
		locale.set('es');
	});
});

describe('the tour chrome is themed', () => {
	const tourChrome = (() => {
		const at = SHELL.indexOf('{#if showComplete');
		const end = SHELL.indexOf('{#if upgradeModalOpen');
		expect(at).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(at);
		return SHELL.slice(at, end);
	})();

	it('declares the scrim token in both ramps', () => {
		const declarations = [...CSS.matchAll(/--mep-scrim:/g)];
		expect(declarations.length).toBe(2);
	});

	it('paints the coach-mark cutout and the modal backdrop with the scrim token', () => {
		expect(COACH).toContain('var(--mep-scrim)');
		expect(tourChrome).toContain('var(--mep-scrim)');
	});

	it('floats every tour surface on the overlay ramp with the shared pop shadow', () => {
		for (const source of [COACH, tourChrome]) {
			expect(source).toContain('var(--mep-overlay)');
			expect(source).toContain('var(--mep-shadow-pop)');
		}
	});

	it('leaves no hard-coded colour in the tour chrome', () => {
		for (const [name, source] of [['CoachMark', COACH], ['shell tour chrome', tourChrome]] as const) {
			expect(source, `${name} still hard-codes a colour`).not.toMatch(/rgba?\(/);
			expect(source, `${name} still hard-codes a hex colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		}
	});

	it('renders inside the .mep scope, where the accent tokens are declared', () => {
		// --mep-acc and friends live on `.mep[data-accent=...]`, not on :root, so
		// tour chrome rendered as a sibling of the shell resolves them to nothing:
		// the primary button loses its fill and the spotlight ring disappears, in
		// both themes, with no error anywhere.
		const shellOpen = SHELL.indexOf('<div class="mep"');
		const chromeOpen = SHELL.indexOf('{#if browser}');
		expect(shellOpen).toBeGreaterThan(-1);
		expect(chromeOpen).toBeGreaterThan(shellOpen);

		const between = SHELL.slice(shellOpen, chromeOpen).split('\n');
		expect(
			between.filter((line) => line === '</div>'),
			'the .mep container closes before the tour chrome',
		).toEqual([]);

		expect(CSS).toMatch(/\.mep\[data-accent="slate"\]\s*\{[^}]*--mep-acc:/);
	});

	it('takes its radii from the radius scale', () => {
		for (const source of [COACH, tourChrome]) {
			for (const decl of source.matchAll(/border-radius:\s*([^;"\n]+)/g)) {
				expect(decl[1].trim()).toMatch(/^var\(--mep-r-(tag|input|card|pill)\)$/);
			}
		}
	});
});

describe('advancing a step cannot be undone by the next page load', () => {
	/**
	 * `setTutorialStep` used to fire its POST and return, then the tour navigated
	 * immediately. `(app)/+layout.server.ts` reads `settings.tutorial_step` on
	 * every load, so the next page could answer with the step the user had just
	 * left, and the seeding effect rolled the store back onto it — leaving the
	 * shell on a page whose step no longer matched, with no coach mark and no way
	 * to reach the rest of the walkthrough. It stalled at a different step each
	 * time, which is what made it look like a rendering glitch.
	 */
	const STORE = read('src/lib/stores/tutorial.ts');

	it('persists the step before navigating', () => {
		expect(SHELL).toContain('await setTutorialStep(next.step as TutorialStep)');
		expect(SHELL).toMatch(/await goToTourStep\(next\)/);
	});

	it('seeds from server data through a guard rather than setting the store directly', () => {
		expect(SHELL).toContain('seedTutorialStep((data.tutorialStep as TutorialStep) ?? null)');
		expect(SHELL).not.toContain('tutorialStep.set(');
	});

	it('the guard ignores server data while a write is still in flight', () => {
		expect(STORE).toContain('export function seedTutorialStep');
		expect(STORE).toMatch(/if \(pending !== null\) return;/);
		expect(STORE).toMatch(/pending = step;/);
	});
});

describe('every tour step has an anchor to point at', () => {
	/**
	 * A step whose `data-coach` anchor is missing — or present but inside a pane
	 * the user has not opened, as `settings-main` was — renders nothing at all and
	 * strands the tour on that page. The anchors are plain attributes in markup,
	 * so nothing but this connects them to the step list.
	 */
	const MARKUP = [
		'src/routes/(app)/dashboard/+page.svelte',
		'src/lib/components/desktop/DesktopDashboard.svelte',
		'src/lib/components/mobile/MobileDashboard.svelte',
		'src/lib/components/mep/ListPageTemplate.svelte',
		'src/routes/(app)/invoices/+page.svelte',
		'src/routes/(app)/suppliers/+page.svelte',
		'src/routes/(app)/analytics/spend/+page.svelte',
		'src/routes/(app)/budgets/+page.svelte',
		'src/routes/(app)/reminders/+page.svelte',
		'src/routes/(app)/reports/+page.svelte',
		'src/routes/(app)/chat/+page.svelte',
		'src/routes/(app)/settings/+page.svelte',
	]
		.map((f) => read(f))
		.join('\n');

	it.each(TOUR_PAGES.map((p) => p.anchor))('%s exists in the markup', (anchor) => {
		// List pages hand the anchor to ListPageTemplate, which spreads it onto its
		// own `data-coach`; either spelling is a real anchor.
		const declared =
			MARKUP.includes(`data-coach="${anchor}"`) || MARKUP.includes(`dataCoach="${anchor}"`);
		expect(declared, `no element carries the ${anchor} anchor`).toBe(true);
	});

	it('anchors the settings step outside the collapsible panes', () => {
		const settings = read('src/routes/(app)/settings/+page.svelte');
		const inPane = settings.slice(settings.indexOf("{#if section === 'ayuda'}"));
		expect(inPane.slice(0, 200)).not.toContain('data-coach="settings-main"');
		expect(settings).toContain('class="set-content" data-coach="settings-main"');
	});

	it('skips an anchor that is hidden at this breakpoint instead of measuring it as a dot', () => {
		expect(COACH).toContain('document.querySelectorAll(`[data-coach="${selector}"]`)');
		expect(COACH).toContain('if (r.width === 0 && r.height === 0) continue;');
	});
});
