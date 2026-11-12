import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations } from '../src/lib/i18n-messages';
import { termsSections, type TermsSection } from '../src/lib/content/legal/terms';
import { FOUNDER_TRIAL_DAYS, TRIAL_DAYS, TIERS } from '../src/lib/server/billing';

const ROOT = path.resolve(__dirname, '..');
const TRIAL_DOCS = TIERS.trial.monthlyInvoiceQuota;
const LOCALES = ['es', 'en'] as const;

function numbersIn(text: string): number[] {
	return (text.match(/\d+/g) ?? []).map(Number);
}

describe('trial length and document cap say the same thing everywhere (code is the source of truth)', () => {
	it('the trial quota is a finite number the copy can quote', () => {
		expect(TRIAL_DOCS).toEqual(expect.any(Number));
	});

	it('billing.tier.trial.limit quotes TRIAL_DAYS and the trial quota, and nothing else', () => {
		for (const loc of LOCALES) {
			const text = translations[loc]['billing.tier.trial.limit'];
			expect(numbersIn(text), loc).toEqual([TRIAL_DAYS, TRIAL_DOCS]);
		}
	});

	it('terms §6 quotes TRIAL_DAYS, the trial quota and FOUNDER_TRIAL_DAYS (only next to founders)', () => {
		const billing = termsSections.find((s) => s.id === 'billing') as Extract<TermsSection, { id: 'billing' }>;
		for (const loc of LOCALES) {
			const text = billing.items[0]![loc];
			expect(numbersIn(text), loc).toEqual([TRIAL_DAYS, TRIAL_DOCS, FOUNDER_TRIAL_DAYS]);
			const founderSentence = text.split('. ').find((s) => s.includes(String(FOUNDER_TRIAL_DAYS)))!;
			expect(founderSentence.toLowerCase(), loc).toMatch(loc === 'es' ? /fundador/ : /founder/);
		}
	});

	it('trial copy that can interpolate the length never hardcodes a number', () => {
		const keys = [
			'signup.metaDesc',
			'signup.subheading',
			'signup.subheadingWaitlist',
			'waitlist.trialNote',
			'waitlist.pricingTrialLimit',
			'waitlist.faq.3.a',
		] as const;
		for (const loc of LOCALES) {
			for (const key of keys) {
				const text = translations[loc][key];
				expect(text, `${loc} ${key}`).toContain('{days}');
				expect(numbersIn(text.replace(/\{[a-z]+\}/g, '')), `${loc} ${key}`).toEqual([]);
			}
		}
	});

	it('the signup page quotes TRIAL_DAYS once access is open and FOUNDER_TRIAL_DAYS while it is a waitlist', () => {
		const server = readFileSync(path.join(ROOT, 'src/routes/signup/+page.server.ts'), 'utf8');
		expect(server).toContain('trialDaysFor(!accessOpen)');
		const page = readFileSync(path.join(ROOT, 'src/routes/signup/+page.svelte'), 'utf8');
		expect(page).toContain("data.accessOpen ? 'signup.subheading' : 'signup.subheadingWaitlist'");
	});

	it('the entitlements doc states the same trial numbers as the code', () => {
		const doc = readFileSync(path.join(ROOT, 'docs/02_product/plans_and_entitlements.md'), 'utf8');
		expect(doc).toContain(`- Trial: ${TRIAL_DAYS} days (\`TRIAL_DAYS\`), ${FOUNDER_TRIAL_DAYS} for founders`);
		expect(doc).toContain(`up to ${TRIAL_DOCS} processed documents`);
		expect(doc).toContain(`| \`trial\` | 0 | — | ${TRIAL_DOCS} |`);
	});
});
