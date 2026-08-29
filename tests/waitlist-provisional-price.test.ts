/**
 * The public /waitlist page must read its tier prices from the same source
 * of truth as /billing — `PROVISIONAL_PRICE` in `src/lib/billing-plans.ts`
 * (issue #439) — and, since issue #407, must source every string of copy
 * from the shared `src/lib/i18n.ts` table instead of a page-local object.
 *
 * Issue #327 extracted the page's markup out of `src/routes/waitlist/+page.svelte`
 * (now a thin wrapper) into the shared `src/lib/components/landing/LandingPage.svelte`
 * — reused by every `/l/[variant]` landing page — so this file's source checks
 * now read that component instead. The wrapper's own byte-identity is covered
 * separately by the DOM comparison run manually for #327 (see its PR/report);
 * this file's job is unchanged: prove the pricing and copy logic itself never
 * drifted, wherever it lives.
 *
 * The first describe block re-verifies #439: `PAID_TIERS` and the "cost" FAQ
 * answer key must reference `PROVISIONAL_PRICE`, never a hardcoded literal.
 *
 * The second describe block is the core acceptance check for #407: it
 * rebuilds, field by field, the exact object the page used to hardcode as
 * `const copy = { es: {...}, en: {...} }` before the migration — but sourced
 * entirely from the shared i18n table (`$t`/`$ti` lookups, `billing.*` reuse,
 * `PROVISIONAL_PRICE`-fed interpolation) — and diffs it against the real
 * pre-migration object, evaluated out of a checked-in snapshot of the page at
 * the last commit before this migration
 * (tests/fixtures/waitlist-page-pre-i18n-881aee69.txt, extracted verbatim via
 * `git show 881aee695ecbd83203ce49df606ca65e721d4cdf:src/routes/waitlist/+page.svelte`
 * — a fixture rather than a live `git show` so the proof also runs in CI's
 * shallow clone). Any string that drifted, any key that was mistranscribed,
 * and any reused `billing.*` key that isn't actually byte-identical to what
 * it replaced will fail this diff.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PROVISIONAL_PRICE, TIER_COPY, type TierId } from '../src/lib/billing-plans';
import { translations, renderTemplate, type Locale } from '../src/lib/i18n';

const ROOT = path.resolve(__dirname, '..');
const PAGE_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/LandingPage.svelte'), 'utf8');

const BARE_PRICE = /\b(29|59|129)\b/;

describe('billing-plans.ts stays the single price source (issue #439)', () => {
	it('exports PROVISIONAL_PRICE with the expected shape and values', () => {
		expect(PROVISIONAL_PRICE).toEqual({ starter: 29, pro: 59, business: 129 });
	});
});

describe('/waitlist reads prices from PROVISIONAL_PRICE, not hardcoded literals', () => {
	it('imports PROVISIONAL_PRICE from $lib/billing-plans', () => {
		expect(PAGE_SRC).toMatch(/import\s*\{\s*PROVISIONAL_PRICE,\s*TIER_COPY,\s*type TierId\s*\}\s*from\s*'\$lib\/billing-plans';/);
	});

	it('the PAID_TIERS array reads every tier price from PROVISIONAL_PRICE', () => {
		const match = PAGE_SRC.match(/const PAID_TIERS[\s\S]*?=\s*\[([\s\S]*?)\n\s*\];/);
		expect(match, 'PAID_TIERS array not found').toBeTruthy();
		const block = match![1];
		expect(block).toContain('PROVISIONAL_PRICE.starter');
		expect(block).toContain('PROVISIONAL_PRICE.pro');
		expect(block).toContain('PROVISIONAL_PRICE.business');
		expect(block).not.toMatch(/price:\s*\d/);
		expect(block).not.toMatch(BARE_PRICE);
	});

	it('the "cost" FAQ answer is interpolated via $ti with PROVISIONAL_PRICE-fed vars, not literal figures', () => {
		const match = PAGE_SRC.match(/\$ti\('waitlist\.faq\.3\.a',\s*\{([\s\S]*?)\}\s*\)/);
		expect(match, '$ti(\'waitlist.faq.3.a\', {...}) call not found').toBeTruthy();
		const block = match![1];
		expect(block).toContain('starter: PROVISIONAL_PRICE.starter');
		expect(block).toContain('pro: PROVISIONAL_PRICE.pro');
		expect(block).toContain('business: PROVISIONAL_PRICE.business');
		expect(block).not.toMatch(BARE_PRICE);
	});

	it('the es/en "cost" FAQ template in i18n.ts interpolates {starter}/{pro}/{business}, not literal figures', () => {
		for (const loc of ['es', 'en'] as const) {
			const template = (translations[loc] as Record<string, string>)['waitlist.faq.3.a'];
			expect(template).toContain('{starter}');
			expect(template).toContain('{pro}');
			expect(template).toContain('{business}');
			expect(template).not.toMatch(BARE_PRICE);
		}
	});
});

function loadPreMigrationCopy(): Record<Locale, Record<string, unknown>> {
	const preMigrationSrc = readFileSync(
		path.join(ROOT, 'tests/fixtures/waitlist-page-pre-i18n-881aee69.txt'),
		'utf8'
	);
	const match = preMigrationSrc.match(/const copy = (\{[\s\S]*?\}) as const;/);
	if (!match) throw new Error('pre-migration copy object literal not found in the pinned git blob');
	const factory = new Function('PROVISIONAL_PRICE', `return (${match[1]});`) as (
		p: typeof PROVISIONAL_PRICE
	) => Record<Locale, Record<string, unknown>>;
	return factory(PROVISIONAL_PRICE);
}

const PRE_MIGRATION_COPY = loadPreMigrationCopy();

function tr(loc: Locale, key: string): string {
	const value = (translations[loc] as Record<string, string>)[key];
	if (value === undefined) throw new Error(`missing i18n key for ${loc}: ${key}`);
	return value;
}

const TIER_QUOTA: Record<TierId, number | null> = { starter: 100, pro: 300, business: null };
const TIER_RECOMMENDED: Record<TierId, boolean> = { starter: false, pro: true, business: false };

function buildPricingTiers(loc: Locale) {
	return (['starter', 'pro', 'business'] as const).map((id) => ({
		name: tr(loc, `billing.plan.${id}`),
		price: PROVISIONAL_PRICE[id],
		recommended: TIER_RECOMMENDED[id],
		tagline: tr(loc, TIER_COPY[id].tagline),
		bullets: TIER_COPY[id].bullets(TIER_QUOTA[id]).map((bullet) =>
			bullet.interpolate ? renderTemplate(loc, bullet.key, bullet.interpolate) : tr(loc, bullet.key)
		)
	}));
}

function buildMigratedCopy(loc: Locale) {
	return {
		pageTitle: tr(loc, 'waitlist.pageTitle'),
		metaDescription: tr(loc, 'waitlist.metaDescription'),
		ogTitle: tr(loc, 'waitlist.ogTitle'),
		ogLocale: loc === 'es' ? 'es_ES' : 'en_US',
		betaBadge: tr(loc, 'waitlist.betaBadge'),
		signInLink: tr(loc, 'waitlist.signInLink'),
		createAccountLink: tr(loc, 'signup.submit'),
		eyebrow: tr(loc, 'waitlist.eyebrow'),
		headline: tr(loc, 'waitlist.headline'),
		sub: tr(loc, 'waitlist.sub'),
		placeholder: tr(loc, 'login.emailPlaceholder'),
		submit: tr(loc, 'waitlist.form.submit'),
		submitShort: tr(loc, 'waitlist.form.submitShort'),
		success: tr(loc, 'waitlist.form.success'),
		successBody: tr(loc, 'waitlist.form.successBody'),
		alreadyReg: tr(loc, 'waitlist.form.alreadyReg'),
		errRequired: tr(loc, 'waitlist.form.errRequired'),
		errInvalid: tr(loc, 'waitlist.form.errInvalid'),
		errRateLimited: tr(loc, 'waitlist.form.errRateLimited'),
		errBot: tr(loc, 'signup.err.bot'),
		privacy: tr(loc, 'waitlist.form.privacy'),
		spotTotal: 50,
		spotLabel: tr(loc, 'waitlist.spotLabel'),
		painEyebrow: tr(loc, 'waitlist.painEyebrow'),
		painHead: tr(loc, 'waitlist.painHead'),
		pain: [0, 1, 2].map((i) => ({
			stat: tr(loc, `waitlist.pain.${i}.stat`),
			label: tr(loc, `waitlist.pain.${i}.label`),
			title: tr(loc, `waitlist.pain.${i}.title`),
			body: tr(loc, `waitlist.pain.${i}.body`)
		})),
		howEyebrow: tr(loc, 'waitlist.howEyebrow'),
		howHead: tr(loc, 'waitlist.howHead'),
		steps: [
			{ num: '01', tag: tr(loc, 'waitlist.steps.0.tag'), title: tr(loc, 'waitlist.steps.0.title'), body: tr(loc, 'waitlist.steps.0.body') },
			{ num: '02', tag: tr(loc, 'waitlist.steps.1.tag'), title: tr(loc, 'waitlist.steps.1.title'), body: tr(loc, 'waitlist.steps.1.body') },
			{ num: '03', tag: tr(loc, 'waitlist.steps.2.tag'), title: tr(loc, 'waitlist.steps.2.title'), body: tr(loc, 'waitlist.steps.2.body') }
		],
		testimonialsEyebrow: tr(loc, 'waitlist.testimonialsEyebrow'),
		testimonials: [0, 1, 2].map((i) => ({
			quote: tr(loc, `waitlist.testimonials.${i}.quote`),
			name: tr(loc, `waitlist.testimonials.${i}.name`),
			role: tr(loc, `waitlist.testimonials.${i}.role`)
		})),
		founderEyebrow: tr(loc, 'waitlist.founderEyebrow'),
		founderBody: tr(loc, 'waitlist.founderBody'),
		founderName: tr(loc, 'waitlist.founderName'),
		founderRole: tr(loc, 'waitlist.founderRole'),
		pricingEyebrow: tr(loc, 'waitlist.pricingEyebrow'),
		pricingTitle: tr(loc, 'waitlist.pricingTitle'),
		pricingSub: tr(loc, 'waitlist.pricingSub'),
		pricingProvisional: tr(loc, 'billing.provisional'),
		pricingPerMonth: tr(loc, 'waitlist.pricingPerMonth'),
		pricingCta: tr(loc, 'waitlist.form.submitShort'),
		pricingRecommended: tr(loc, 'billing.recommended'),
		pricingFoot: tr(loc, 'waitlist.pricingFoot'),
		pricingTrialName: tr(loc, 'billing.tier.trial.name'),
		pricingTrialPrice: tr(loc, 'waitlist.pricingTrialPrice'),
		pricingTrialLimit: tr(loc, 'waitlist.pricingTrialLimit'),
		pricingTrialTagline: tr(loc, 'billing.tier.trial.tagline'),
		pricingTiers: buildPricingTiers(loc),
		faqEyebrow: tr(loc, 'waitlist.faqEyebrow'),
		faq: [
			{ q: tr(loc, 'waitlist.faq.0.q'), a: tr(loc, 'waitlist.faq.0.a') },
			{ q: tr(loc, 'waitlist.faq.1.q'), a: tr(loc, 'waitlist.faq.1.a') },
			{ q: tr(loc, 'waitlist.faq.2.q'), a: tr(loc, 'waitlist.faq.2.a') },
			{
				q: tr(loc, 'waitlist.faq.3.q'),
				a: renderTemplate(loc, 'waitlist.faq.3.a', {
					starter: PROVISIONAL_PRICE.starter,
					pro: PROVISIONAL_PRICE.pro,
					business: PROVISIONAL_PRICE.business
				})
			},
			{ q: tr(loc, 'waitlist.faq.4.q'), a: tr(loc, 'waitlist.faq.4.a') }
		],
		closeHead: tr(loc, 'waitlist.closeHead'),
		closeSub: tr(loc, 'waitlist.closeSub'),
		footerNote: tr(loc, 'waitlist.footerNote'),
		mockWhatsappReply: tr(loc, 'waitlist.mock.whatsappReply'),
		mockConfirmed: tr(loc, 'waitlist.mock.confirmed'),
		mockExtractedIn: tr(loc, 'waitlist.mock.extractedIn'),
		mockLinesVat: tr(loc, 'waitlist.mock.linesVat'),
		mockSpendLabel: tr(loc, 'waitlist.mock.spendLabel'),
		mockCatMeat: tr(loc, 'waitlist.mock.catMeat'),
		mockCatFish: tr(loc, 'tpl.demo.category.pescado'),
		mockCatVeg: tr(loc, 'waitlist.mock.catVeg'),
		mockAlertTitle: tr(loc, 'waitlist.mock.alertTitle'),
		mockReview: tr(loc, 'action.review'),
		mockKpiSpend: tr(loc, 'waitlist.mock.kpiSpend'),
		mockKpiAvg: tr(loc, 'waitlist.mock.kpiAvg'),
		mockKpiPending: tr(loc, 'dash.kpi.pending'),
		mockKpiBudget: tr(loc, 'dash.budget'),
		mockKpiOf: tr(loc, 'waitlist.mock.kpiOf'),
		mockKpiInvoicesShort: tr(loc, 'shell.quota'),
		mockChartTitle: tr(loc, 'waitlist.mock.chartTitle')
	};
}

/**
 * Deliberate, documented deviations from the pinned #407 snapshot — never add
 * to this map to paper over an accidental drift; each entry must correspond
 * to a real, intentional copy change made in a later issue.
 *
 * - `privacy` (issue #326): the waitlist form now also captures UTM/referrer
 *   attribution alongside the email, so "Solo guardamos tu email" / "We only
 *   store your email" stopped being accurate and was trimmed to the parts
 *   that still are.
 * - `faq[4].a` (issue #333 part 2): the "when does access start" answer
 *   advertised a "July 2026" opening that had passed by the time #327 fanned
 *   this copy out to five more landing-page variants. We cannot invent a real
 *   date, so the date framing was dropped in favour of the batch-cadence
 *   wording already used elsewhere on the page ("abrimos en tandas" / "we
 *   open in batches"), rather than replaced with another guess. `faq` is
 *   nested (an array of {q,a}), so it is patched separately below rather
 *   than through the flat POST_407_INTENTIONAL_CHANGES spread.
 */
const POST_407_INTENTIONAL_CHANGES: Record<Locale, Partial<Record<string, string>>> = {
	es: { privacy: 'Sin spam. Sin compromisos.' },
	en: { privacy: 'No spam. No commitment.' },
};

const POST_333_FAQ_4_A: Record<Locale, string> = {
	es: 'Abrimos en tandas según vamos incorporando restaurantes. Avisamos por email con al menos una semana de antelación.',
	en: 'We open in batches as we bring on new restaurants. We notify by email at least a week in advance.',
};

/**
 * GEO Phase 0 — retracted claims.
 *
 * Three strings asserted things the product does not do (marketing rule 1):
 * a Square/Revo POS integration that is not built, and EU-encryption /
 * never-train guarantees that were never confirmed against the actual
 * infrastructure. `steps[2]` additionally promised real-time *margin*, which
 * is not computable without the sales data that integration would have
 * supplied. They are retracted rather than restated, and pinned here so the
 * migration diff above stays meaningful. See tests/landing-claims-ratchet.test.ts.
 */
const POST_GEO0_STEPS_2_BODY: Record<Locale, string> = {
	es: 'Gasto por categoría. Alertas de precio. Comparativa entre proveedores y entre locales. Tu coste de compra, al día.',
	en: 'Spend by category. Price alerts. Comparison across suppliers and across venues. Your purchase cost, up to date.',
};

const POST_GEO0_FAQ: Record<Locale, Record<number, string>> = {
	es: {
		0: 'Tus albaranes son tuyos: puedes exportarlos o eliminarlos en cualquier momento. En la política de privacidad explicamos dónde se alojan tus datos, cuánto tiempo se conservan y quién los trata.',
		1: 'No. Mise en Place trabaja sobre tus albaranes y facturas, sea cual sea tu TPV, y exporta a Excel/CSV para que el dato entre donde lo necesites. Las integraciones directas con TPV están en la hoja de ruta, todavía no disponibles. Si usas uno en concreto, escríbenos y lo tenemos en cuenta al priorizar.',
	},
	en: {
		0: 'Your delivery notes are yours: you can export or delete them at any time. Our privacy policy explains where your data is hosted, how long it is kept, and who processes it.',
		1: 'No. Mise en Place works from your delivery notes and invoices, whatever POS you use, and exports to Excel/CSV so the data lands wherever you need it. Direct POS integrations are on the roadmap, not available yet. If you use a particular one, write to us and we will weigh it when prioritising.',
	},
};

describe('waitlist copy migration is byte-identical to the pre-migration inline object (issue #407)', () => {
	it('the pinned pre-migration git blob still contains the expected copy object', () => {
		expect(Object.keys(PRE_MIGRATION_COPY)).toEqual(['es', 'en']);
		expect(PRE_MIGRATION_COPY.es.headline).toBe('Sabe en qué gasta tu cocina, antes que tú.');
	});

	for (const loc of ['es', 'en'] as const) {
		it(`renders identical ${loc} copy via $t/$ti against the shared i18n table, aside from documented later changes`, () => {
			const expected = { ...PRE_MIGRATION_COPY[loc], ...POST_407_INTENTIONAL_CHANGES[loc] };
			const preMigrationFaq = expected.faq as { q: string; a: string }[];
			expected.faq = preMigrationFaq.map((row, i) => {
				if (i === 4) return { ...row, a: POST_333_FAQ_4_A[loc] };
				const retracted = POST_GEO0_FAQ[loc][i];
				return retracted === undefined ? row : { ...row, a: retracted };
			});
			const preMigrationSteps = expected.steps as { num: string; tag: string; title: string; body: string }[];
			expected.steps = preMigrationSteps.map((row, i) =>
				i === 2 ? { ...row, body: POST_GEO0_STEPS_2_BODY[loc] } : row
			);
			expect(buildMigratedCopy(loc)).toEqual(expected);
		});
	}
});
