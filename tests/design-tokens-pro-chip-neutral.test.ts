/**
 * The PRO chip is state, not an action — ADR-026 reserves `--mep-acc` for
 * things you press. A chip labelling a locked sidebar section or the
 * upgrade dialog's title just says "this needs a plan"; it must never read
 * as a button sitting next to one.
 *
 * #715 moved the sidebar's chip (and the collapsed-rail lock dots, and the
 * sparkles divider) to the neutral spelling below. #711 rebuilt the upgrade
 * dialog on a branch cut before #715 landed, so it carried the old accent
 * spelling; rebasing that PR quietly resurrected it in the merged app shell.
 * This test pins both chips to the same neutral tokens so a future rebase
 * or copy-paste can't do that again silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const LAYOUT = path.join(ROOT, 'src/routes/(app)/+layout.svelte');
const layout = readFileSync(LAYOUT, 'utf8');

/** bg-hover + text-fg-2 + border border-border */
const NEUTRAL_CHIP = [/\bbg-hover\b/, /\btext-fg-2\b/, /\bborder-border\b/];

/** Every span rendering the PRO badge translation key, wherever it sits in the file. */
const chipSpans = [...layout.matchAll(/<span\s+class="([^"]*)">\{t\('nav\.badge\.pro'\)\}<\/span>/g)].map(
	m => m[1],
);

describe('PRO chip stays neutral (ADR-026)', () => {
	it('finds the PRO chip in both the sidebar heading and the upgrade dialog', () => {
		// Guards the test itself against a markup rewrite silently dropping a
		// chip out of the pattern above and leaving this suite vacuously green.
		expect(chipSpans).toHaveLength(2);
	});

	it('never spells a PRO chip with --mep-acc', () => {
		const offenders = chipSpans.filter(cls => /--mep-acc|(?:bg|text|border)-acc\b/.test(cls));
		expect(offenders).toEqual([]);
	});

	it('every PRO chip uses the neutral background/color/border triple', () => {
		const offenders = chipSpans.filter(cls => !NEUTRAL_CHIP.every(re => re.test(cls)));
		expect(offenders).toEqual([]);
	});
});
