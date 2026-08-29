/**
 * AlertRow.svelte's "share this price shock" affordance (issue #329).
 *
 * No component-render harness exists in this repo (no jsdom/testing-library
 * dependency), so this pins the source-level contract instead: the share
 * button only appears for price-kind alerts, and the POST it fires carries
 * no request body — nothing derived from `alert` (ingredient, supplier,
 * price, category) is ever sent, so there is no channel for that data to
 * reach the share token beyond the current week it belongs to.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
	path.join(process.cwd(), 'src/lib/components/mep/AlertRow.svelte'),
	'utf8',
);

describe('AlertRow share affordance (issue #329)', () => {
	it('gates the share button on kind === \'price\'', () => {
		expect(SRC).toMatch(/\{#if alert\.kind === 'price'\}/);
	});

	it('posts to /api/alert-share with no request body', () => {
		const call = SRC.match(/fetch\('\/api\/alert-share',\s*\{[^}]*\}\)/)?.[0] ?? '';
		expect(call).toContain("method: 'POST'");
		expect(call).not.toMatch(/body\s*:/);
	});

	it('never includes alert.detail, alert.text, or alert.messageVars in the share call site', () => {
		const shareFnBody = SRC.match(/async function shareAlert\(\)[^]*?\n  \}/)?.[0] ?? '';
		expect(shareFnBody).not.toContain('alert.detail');
		expect(shareFnBody).not.toContain('alert.text');
		expect(shareFnBody).not.toContain('alert.messageVars');
	});

	it('reuses the same tokenised mechanism as the digest share (copy/copied i18n keys)', () => {
		expect(SRC).toContain("$t('dshare.copy')");
		expect(SRC).toContain("$t('dshare.copied')");
		expect(SRC).toContain("$t('ashare.button')");
	});
});
