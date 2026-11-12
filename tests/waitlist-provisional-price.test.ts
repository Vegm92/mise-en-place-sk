/**
 * The public landing (/waitlist and every /l/[variant] page, both rendered by
 * src/lib/components/landing/LandingPage.svelte) must read its tier prices
 * from the same source of truth as /billing — `PROVISIONAL_PRICE` in
 * src/lib/billing-plans.ts (issue #439) — and its plan quotas, location caps
 * and trial terms from the entitlements the app actually enforces (`TIERS`,
 * `FOUNDER_TRIAL_DAYS` in src/lib/server/billing.ts), never from literals
 * typed into the page.
 *
 * The checks below are deliberately value-agnostic: prices are provisional
 * and change in billing-plans.ts, and this file must keep passing when they
 * do, as long as the landing still renders whatever that module exports.
 *
 * History: this file used to carry a byte-identity diff of the whole landing
 * copy against a snapshot of the page taken before the #407 i18n migration
 * (tests/fixtures/waitlist-page-pre-i18n-881aee69.txt). Its job was to prove
 * that migration moved strings without changing them. The ICP landing rebuild
 * rewrote the copy on purpose, so that diff had stopped describing anything
 * and was retired together with its fixture. What it protected — no price or
 * quota literal on the page — is pinned directly here instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PROVISIONAL_PRICE } from '../src/lib/billing-plans';
import { translations } from '../src/lib/i18n-messages';
import { landingTiers, PAID_TIER_IDS } from '../src/lib/landing-plans';
import { landingFacts } from '../src/lib/server/landing-facts';
import { FOUNDER_TRIAL_DAYS, TIERS } from '../src/lib/server/billing';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE_SRC = read('src/lib/components/landing/LandingPage.svelte');
const PLANS_SRC = read('src/lib/landing-plans.ts');
const CALC_SRC = read('src/lib/components/landing/SavingsCalculator.svelte');

const priceValues = Object.values(PROVISIONAL_PRICE);
const BARE_PRICE = new RegExp(`\\b(${priceValues.join('|')})\\b`);

describe('billing-plans.ts stays the single price source (issue #439)', () => {
	it('exports a finite, non-negative monthly price for every paid tier', () => {
		for (const id of PAID_TIER_IDS) {
			expect(Number.isFinite(PROVISIONAL_PRICE[id]), id).toBe(true);
			expect(PROVISIONAL_PRICE[id]).toBeGreaterThanOrEqual(0);
		}
	});
});

describe('the landing reads prices from PROVISIONAL_PRICE, not hardcoded literals', () => {
	it('LandingPage imports PROVISIONAL_PRICE and TIER_COPY from $lib/billing-plans', () => {
		expect(PAGE_SRC).toMatch(/import\s*\{\s*PROVISIONAL_PRICE,\s*TIER_COPY\s*\}\s*from\s*'\$lib\/billing-plans';/);
	});

	it('landingTiers() takes every tier price from PROVISIONAL_PRICE', () => {
		expect(PLANS_SRC).toContain('price: PROVISIONAL_PRICE[id]');
		expect(PLANS_SRC).not.toMatch(/price:\s*\d/);
		const tiers = landingTiers(landingFacts().plans);
		expect(tiers.map((t) => t.id)).toEqual([...PAID_TIER_IDS]);
		for (const tier of tiers) expect(tier.price).toBe(PROVISIONAL_PRICE[tier.id]);
	});

	it('neither the page nor the calculator carries a bare price literal', () => {
		const markup = (src: string) => src.replace(/<style>[\s\S]*?<\/style>/, '');
		expect(markup(PAGE_SRC)).not.toMatch(BARE_PRICE);
		expect(markup(CALC_SRC)).not.toMatch(BARE_PRICE);
	});

	it('the "cost" FAQ answer is interpolated via ti with PROVISIONAL_PRICE-fed vars and the real trial length', () => {
		const match = PAGE_SRC.match(/ti\('waitlist\.faq\.3\.a',\s*\{([\s\S]*?)\}\s*\)/);
		expect(match, "ti('waitlist.faq.3.a', {...}) call not found").toBeTruthy();
		const block = match![1]!;
		expect(block).toContain('starter: PROVISIONAL_PRICE.starter');
		expect(block).toContain('pro: PROVISIONAL_PRICE.pro');
		expect(block).toContain('business: PROVISIONAL_PRICE.business');
		expect(block).toContain('days: data.facts.trial.days');
		expect(block).not.toMatch(BARE_PRICE);
	});

	it('the es/en "cost" FAQ templates interpolate {starter}/{pro}/{business}/{days}, not literal figures', () => {
		for (const loc of ['es', 'en'] as const) {
			const template = (translations[loc] as Record<string, string>)['waitlist.faq.3.a']!;
			for (const v of ['{starter}', '{pro}', '{business}', '{days}']) expect(template, `${loc} ${v}`).toContain(v);
			expect(template.replace(/\{\w+\}/g, '')).not.toMatch(/\d/);
		}
	});
});

describe('quotas, location caps and trial terms come from the enforced entitlements', () => {
	it('landingFacts() mirrors TIERS for every paid tier', () => {
		const { plans } = landingFacts();
		for (const id of PAID_TIER_IDS) {
			expect(plans[id]).toEqual({ quota: TIERS[id].monthlyInvoiceQuota, maxLocations: TIERS[id].maxLocations });
		}
	});

	it('the advertised trial is the founder trial the waitlist cohort actually gets', () => {
		expect(landingFacts().trial).toEqual({ days: FOUNDER_TRIAL_DAYS, documents: TIERS.trial.monthlyInvoiceQuota });
	});

	it('the page no longer hardcodes a quota table', () => {
		expect(PAGE_SRC).not.toMatch(/quota:\s*\d/);
		expect(PAGE_SRC).not.toMatch(/quota:\s*null/);
		expect(PAGE_SRC).toContain('TIER_COPY[tier.id].bullets(tier.quota)');
	});

	it('the trial copy is interpolated, so it cannot drift from FOUNDER_TRIAL_DAYS', () => {
		for (const loc of ['es', 'en'] as const) {
			const table = translations[loc] as Record<string, string>;
			expect(table['waitlist.pricingTrialLimit']).toContain('{days}');
			expect(table['waitlist.pricingTrialLimit']).toContain('{docs}');
			expect(table['waitlist.trialNote']).toContain('{days}');
		}
	});
});
