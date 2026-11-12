<script lang="ts">
  import { onMount } from 'svelte';
  import { toggleTheme as flipTheme, currentTheme } from '$lib/theme';
  import { browser } from '$app/environment';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Camera from '@lucide/svelte/icons/camera';
  import ScanText from '@lucide/svelte/icons/scan-text';
  import BellRing from '@lucide/svelte/icons/bell-ring';
  import Clock from '@lucide/svelte/icons/clock';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { PROVISIONAL_PRICE, TIER_COPY } from '$lib/billing-plans';
  import { landingTiers, type LandingFacts } from '$lib/landing-plans';
  import { DEFAULT_DRIFT, DEFAULT_MONTHLY_SPEND, formatPct, stakeAt } from '$lib/savings-calculator';
  import { fmtEurCompact } from '$lib/formatters';
  import { page } from '$app/state';
  import { setLocale } from '$lib/i18n';
  import { getLocale, getT, getTi } from '$lib/i18n-context';
  import { localeHref, otherLocale } from '$lib/locale-url';
  import { overrideFor, interpolate, type LandingOverrides } from '$lib/landing-copy';
  import EmailForm from '$lib/components/waitlist/EmailForm.svelte';
  import SavingsCalculator from './SavingsCalculator.svelte';
  import SampleProof from './SampleProof.svelte';
  import Logo from '$lib/components/mep/Logo.svelte';

  type JoinActionData = { success?: boolean; error?: string; alreadyRegistered?: boolean; referralCode?: string | null } | null | undefined;

  let {
    form,
    data,
    overrides = null,
  }: {
    form: JoinActionData;
    data: { canonicalUrl: string; spotTaken: number; facts: LandingFacts };
    overrides?: LandingOverrides | null;
  } = $props();

  const locale = getLocale();
  const baseT = getT();
  const baseTi = getTi();

  const t = (key: string): string => overrideFor(overrides, locale.current, key) ?? baseT(key);

  const ti = (key: string, vars: Record<string, string | number>): string => {
    const override = overrideFor(overrides, locale.current, key);
    return override === undefined ? baseTi(key, vars) : interpolate(override, vars);
  };

  let theme = $state<'light' | 'dark'>(
    browser ? currentTheme() : 'light'
  );

  onMount(() => {
    const storedTheme = localStorage.getItem('mep-theme') as 'light' | 'dark' | null;
    if (storedTheme && storedTheme !== theme) theme = storedTheme;
  });

  function toggleTheme() {
    theme = flipTheme();
  }

  const alternate = $derived(otherLocale(locale.current));
  const alternateHref = $derived(localeHref(page.url, alternate));

  function rememberLocale() {
    setLocale(alternate);
  }

  const SPOT_TOTAL = 50;

  const PAID_TIERS = $derived(landingTiers(data.facts.plans));

  const heroStake = stakeAt(DEFAULT_MONTHLY_SPEND, DEFAULT_DRIFT);

  const headline = $derived(ti('waitlist.headline', {
    spend: fmtEurCompact(DEFAULT_MONTHLY_SPEND, locale.current),
    pct: formatPct(DEFAULT_DRIFT, locale.current),
    yearly: fmtEurCompact(heroStake.yearly, locale.current),
  }));

  let openFaq = $state(0);

  const faqUid = $props.id();

  const painItems = $derived([
    { stat: t('waitlist.pain.0.stat'), label: t('waitlist.pain.0.label'), title: t('waitlist.pain.0.title'), body: t('waitlist.pain.0.body') },
    { stat: t('waitlist.pain.1.stat'), label: t('waitlist.pain.1.label'), title: t('waitlist.pain.1.title'), body: t('waitlist.pain.1.body') },
    { stat: t('waitlist.pain.2.stat'), label: t('waitlist.pain.2.label'), title: t('waitlist.pain.2.title'), body: t('waitlist.pain.2.body') },
  ]);

  const stepItems = $derived([
    { icon: Camera, tag: t('waitlist.steps.0.tag'), title: t('waitlist.steps.0.title'), body: t('waitlist.steps.0.body') },
    { icon: ScanText, tag: t('waitlist.steps.1.tag'), title: t('waitlist.steps.1.title'), body: t('waitlist.steps.1.body') },
    { icon: BellRing, tag: t('waitlist.steps.2.tag'), title: t('waitlist.steps.2.title'), body: t('waitlist.steps.2.body') },
  ]);

  const trustBarItems = $derived([
    { label: t('waitlist.trustBar.cadence.label'), body: t('waitlist.trustBar.cadence.body') },
    { label: t('waitlist.trustBar.support.label'), body: t('waitlist.trustBar.support.body') },
    { label: t('waitlist.trustBar.privacy.label'), body: t('waitlist.trustBar.privacy.body') },
  ]);

  const faqItems = $derived([
    { q: t('waitlist.faq.0.q'), a: t('waitlist.faq.0.a') },
    { q: t('waitlist.faq.1.q'), a: t('waitlist.faq.1.a') },
    { q: t('waitlist.faq.2.q'), a: t('waitlist.faq.2.a') },
    {
      q: t('waitlist.faq.3.q'),
      a: ti('waitlist.faq.3.a', {
        starter: PROVISIONAL_PRICE.starter,
        pro: PROVISIONAL_PRICE.pro,
        business: PROVISIONAL_PRICE.business,
        days: data.facts.trial.days,
      }),
    },
    { q: t('waitlist.faq.4.q'), a: t('waitlist.faq.4.a') },
    { q: t('waitlist.faq.5.q'), a: t('waitlist.faq.5.a') },
  ]);

  const emailFormCopy = $derived({
    placeholder:    t('login.emailPlaceholder'),
    submit:         t('waitlist.form.submit'),
    submitShort:    t('waitlist.form.submitShort'),
    success:        t('waitlist.form.success'),
    successBody:    t('waitlist.form.successBody'),
    alreadyReg:     t('waitlist.form.alreadyReg'),
    errRequired:    t('waitlist.form.errRequired'),
    errInvalid:     t('waitlist.form.errInvalid'),
    errRateLimited: t('waitlist.form.errRateLimited'),
    errBot:         t('signup.err.bot'),
    errUnavailable: t('signup.err.serviceUnavailable'),
    privacy:        t('waitlist.form.privacy'),
    privacyLink:    t('waitlist.form.privacyLink'),
    emailLabel:     t('waitlist.form.emailLabel'),
    referralIntro:  t('waitlist.form.referralIntro'),
    referralLabel:  t('waitlist.form.referralLabel'),
    referralCopy:   t('waitlist.form.referralCopy'),
    referralCopied: t('waitlist.form.referralCopied'),
  });

  const siteRoot = $derived.by(() => {
    try {
      return new URL(data.canonicalUrl).origin;
    } catch {
      return data.canonicalUrl;
    }
  });
</script>

<svelte:head>
  <title>{t('waitlist.pageTitle')}</title>
  <meta name="description" content={t('waitlist.metaDescription')} />
  <link rel="canonical" href={data.canonicalUrl} />

  <meta property="og:type"        content="website" />
  <meta property="og:url"         content={data.canonicalUrl} />
  <meta property="og:site_name"   content="Mise en Place" />
  <meta property="og:title"       content={t('waitlist.ogTitle')} />
  <meta property="og:description" content={t('waitlist.metaDescription')} />
  <meta property="og:locale"      content={locale.current === 'es' ? 'es_ES' : 'en_US'} />

  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content={t('waitlist.ogTitle')} />
  <meta name="twitter:description" content={t('waitlist.metaDescription')} />

  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'Mise en Place',
        url: siteRoot,
        inLanguage: locale.current === 'es' ? 'es' : 'en',
        potentialAction: { '@type': 'RegisterAction', target: data.canonicalUrl + '#join' },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Mise en Place',
        description: t('waitlist.metaDescription'),
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: t('waitlist.jsonLdOfferDescription') },
        creator: { '@type': 'Organization', name: 'Mise en Place', address: { '@type': 'PostalAddress', addressLocality: 'Barcelona', addressCountry: 'ES' } },
      },
    ],
  }).replace(/</g, '\\u003c')}</script>`}
</svelte:head>

<div class="mep w-full min-h-screen bg-bg text-fg font-[inherit]" data-accent="tinta">

  <nav class="flex flex-wrap items-center gap-3 border-b border-divider px-4 py-3 sm:px-8 sm:py-4">
    <Logo size={20} wordmark />
    <span class="hidden rounded px-[7px] py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-acc bg-acc-soft sm:inline">{t('waitlist.betaBadge')}</span>
    <div class="flex-1"></div>
    <button onclick={toggleTheme} aria-label={t('waitlist.themeToggleLabel')} class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-fg-2">
      {#if theme === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
    </button>
    <a href={alternateHref} hreflang={alternate} lang={alternate} rel="alternate"
       onclick={rememberLocale} class="inline-flex h-9 items-center rounded-full border border-border bg-surface px-3 font-mono text-[12px] font-semibold tracking-[0.06em] text-fg-2 no-underline">{locale.current === 'es' ? 'EN' : 'ES'}</a>
    <a href="/login" class="btn btn-secondary h-9 whitespace-nowrap px-3.5 text-[13px] font-semibold no-underline">{t('waitlist.signInLink')}</a>
  </nav>

  <section class="px-4 pt-12 pb-14 sm:px-8 lg:px-[72px] lg:pt-24 lg:pb-20">
    <div class="mx-auto grid max-w-[1180px] items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
      <div>
        <div class="mep-eyebrow mb-5">{t('waitlist.eyebrow')}</div>
        <h1 class="m-0 text-balance text-[clamp(30px,4.4vw,50px)] font-semibold leading-[1.1] tracking-[-0.03em] text-fg">{headline}</h1>
        <p class="mt-5 mb-0 max-w-[580px] text-pretty text-[17px] leading-[1.6] text-fg-2 sm:text-[18px]">{t('waitlist.sub')}</p>

        <div class="mt-8 max-w-[500px]" id="join">
          <EmailForm big={true} {form} copy={emailFormCopy} referralBase={data.canonicalUrl} />
        </div>
        <p class="mt-3 mb-0 text-[14.5px] font-semibold text-fg">{ti('waitlist.trialNote', { days: data.facts.trial.days })}</p>
        <a href="#calculadora" class="mt-1.5 inline-block text-[14px] text-fg-2 underline underline-offset-2">{t('waitlist.heroCalcLink')}</a>

        <div class="mt-6 flex max-w-[500px] flex-wrap items-center gap-3.5 rounded-[10px] border border-divider bg-surface px-3.5 py-2.5">
          <div class="flex items-baseline gap-1.5">
            <span class="font-mono text-2xl font-bold leading-none tracking-[-0.6px] text-acc">{data.spotTaken}</span>
            <span class="font-mono text-[15px] text-fg-3">/ {SPOT_TOTAL}</span>
          </div>
          <div class="min-w-[120px] flex-1">
            <div class="mb-[5px] font-mono text-xs font-medium uppercase tracking-[0.06em] text-fg-3">{t('waitlist.spotLabel')}</div>
            <progress class="mep-spot-progress" max={SPOT_TOTAL} value={Math.min(data.spotTaken, SPOT_TOTAL)} aria-label={t('waitlist.spotLabel')}></progress>
          </div>
        </div>
      </div>

      <div class="mx-auto w-full max-w-[520px]">
        <div class="mb-3 text-[15px] font-semibold text-fg">{t('waitlist.proof.title')}</div>
        <SampleProof alert={data.facts.sampleAlert} />
      </div>
    </div>
  </section>

  <section id="calculadora" class="mep-tinted scroll-mt-4 px-4 py-14 sm:px-8 lg:px-[72px] lg:py-[76px]">
    <div class="mep-container">
      <div class="mep-eyebrow mb-3.5">{t('waitlist.calc.eyebrow')}</div>
      <h2 class="mep-h2">{t('waitlist.calc.head')}</h2>
      <p class="mt-3.5 mb-0 max-w-[620px] text-pretty text-[15px] leading-[1.6] text-fg-2">{t('waitlist.calc.sub')}</p>
      <div class="mt-9">
        <SavingsCalculator tiers={PAID_TIERS} />
      </div>
      <a href="#join" class="btn btn-secondary mt-6 h-11 px-5 text-[15px] font-semibold no-underline">{t('waitlist.form.submit')}</a>
    </div>
  </section>

  <section class="px-4 py-14 sm:px-8 lg:px-[72px] lg:py-[76px]">
    <div class="mep-container">
      <div class="mep-eyebrow mb-3.5">{t('waitlist.painEyebrow')}</div>
      <h2 class="mep-h2">{t('waitlist.painHead')}</h2>
      <div class="mep-grid-3 mt-11">
        {#each painItems as p}
          <div class="border-t border-border pt-5">
            <div class="mb-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span class="font-mono text-[30px] font-bold leading-none tracking-[-0.03em] text-fg">{p.stat}</span>
              <span class="font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-fg-3">{p.label}</span>
            </div>
            <h3 class="m-0 mb-2.5 text-[17px] font-semibold leading-[1.3] tracking-[-0.02em] text-fg">{p.title}</h3>
            <p class="m-0 text-sm leading-[1.6] text-fg-2">{p.body}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="px-4 pb-14 sm:px-8 lg:px-[72px] lg:pb-[88px]">
    <div class="mep-container">
      <div class="mep-eyebrow mb-3.5">{t('waitlist.howEyebrow')}</div>
      <h2 class="mep-h2">{t('waitlist.howHead')}</h2>
      <ol class="mep-grid-3 m-0 mt-11 list-none p-0">
        {#each stepItems as step}
          <li class="rounded-card border border-border bg-surface p-6">
            <div class="mb-4 flex items-center gap-2.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-acc">
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-acc-soft" aria-hidden="true"><step.icon size={16} /></span>
              <span>{step.tag}</span>
            </div>
            <h3 class="m-0 text-[19px] font-semibold leading-[1.3] tracking-[-0.01em] text-fg">{step.title}</h3>
            <p class="mt-2.5 mb-0 text-[14.5px] leading-[1.6] text-fg-2">{step.body}</p>
          </li>
        {/each}
      </ol>
    </div>
  </section>

  <section class="mep-tinted px-4 py-14 sm:px-8 lg:px-[72px] lg:py-[76px]">
    <div class="mx-auto max-w-[1080px]">
      <div class="mep-eyebrow mb-3.5">{t('waitlist.pricingEyebrow')}</div>
      <h2 class="mep-h2">{t('waitlist.pricingTitle')}</h2>
      <p class="mt-3.5 mb-0 max-w-[620px] text-pretty text-[15px] leading-[1.6] text-fg-2">{t('waitlist.pricingSub')}</p>

      <div class="mt-11 grid items-stretch gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div class="card flex flex-col gap-3.5 border-dashed bg-transparent p-5 shadow-none">
          <h3 class="m-0 text-lg font-semibold tracking-[-0.01em] text-fg">{t('billing.tier.trial.name')}</h3>
          <div>
            <div class="num text-[35px] font-semibold leading-[1.1] tracking-[-0.025em] text-fg">{t('waitlist.pricingTrialPrice')}</div>
            <div class="mt-2 text-[12.5px] text-fg-3">{ti('waitlist.pricingTrialLimit', { days: data.facts.trial.days, docs: data.facts.trial.documents ?? 0 })}</div>
          </div>
          <div class="text-sm leading-[1.45] text-fg-2">{t('billing.tier.trial.tagline')}</div>
          <a href="#join" class="btn btn-secondary mt-auto h-10 justify-center no-underline">{t('waitlist.form.submitShort')}</a>
        </div>

        {#each PAID_TIERS as tier}
          <div class="card relative flex flex-col gap-3.5 p-5 shadow-card {tier.featured ? 'border-acc ring-1 ring-acc' : 'border-border'}">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="m-0 text-lg font-semibold tracking-[-0.01em] text-fg">{t(`billing.plan.${tier.id}`)}</h3>
              {#if tier.featured}
                <span class="rounded-tag bg-acc px-[7px] py-0.5 text-xs font-medium text-acc-fg">{t('waitlist.pricingFeatured')}</span>
              {/if}
            </div>
            <div>
              <div class="flex items-baseline gap-1.5">
                <span class="num text-[35px] font-semibold leading-[1.1] tracking-[-0.025em] text-fg">{fmtEurCompact(tier.price, locale.current)}</span>
                <span class="text-sm text-fg-3">{t('waitlist.pricingPerMonth')}</span>
              </div>
              <span class="mt-2 inline-flex items-center rounded border border-dashed border-border-strong px-[5px] py-px text-[11.5px] font-medium uppercase tracking-[0.02em] text-fg-3">{t('billing.provisional')}</span>
            </div>
            <p class="m-0 text-sm font-semibold leading-[1.45] text-fg">{ti(`waitlist.plan.${tier.id}.audience`, { n: tier.maxLocations })}</p>
            <p class="m-0 text-sm leading-[1.45] text-fg-2">{t(TIER_COPY[tier.id].tagline)}</p>
            <a href="#join" class="btn {tier.featured ? 'btn-primary' : 'btn-secondary'} h-10 justify-center no-underline">{t('waitlist.form.submitShort')}</a>
            <div class="h-px bg-divider"></div>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              {#each TIER_COPY[tier.id].bullets(tier.quota) as bullet}
                <li class="flex items-start gap-2 text-sm leading-[1.4] text-fg-2">
                  <svg class="mt-0.5 shrink-0 {tier.featured ? 'text-acc' : 'text-fg-3'}" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 10.5l3.5 3.5L16 5.5"/></svg>
                  <span>{bullet.interpolate ? ti(bullet.key, bullet.interpolate) : t(bullet.key)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>

      <p class="mt-8 mb-0 max-w-[780px] text-pretty text-[14px] font-medium leading-[1.6] text-fg">{t('waitlist.pricingFounder')}</p>
      <p class="mt-2 mb-0 max-w-[780px] text-pretty text-[13.5px] leading-[1.6] text-fg-3">{t('waitlist.pricingFoot')}</p>
    </div>
  </section>

  <section class="px-4 py-14 sm:px-8 lg:px-[72px] lg:py-[76px]">
    <div class="mx-auto flex max-w-[860px] flex-col items-start gap-6 rounded-2xl border border-divider bg-surface px-6 py-7 sm:flex-row sm:px-9 sm:py-8">
      <div class="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border border-border bg-acc font-mono text-[26px] font-bold tracking-[-1px] text-acc-fg sm:h-[92px] sm:w-[92px] sm:text-[31px]" aria-hidden="true">{t('waitlist.founderInitials')}</div>
      <figure class="m-0 flex-1">
        <div class="mb-2.5 font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em] text-acc">{t('waitlist.founderEyebrow')}</div>
        <blockquote class="m-0 text-[18px] leading-[1.55] tracking-[-0.005em] text-fg sm:text-[19px]">
          &ldquo;{t('waitlist.founderBody')}&rdquo;
        </blockquote>
        <figcaption class="mt-3.5 text-[13px] text-fg-2">
          <span class="font-semibold text-fg">{t('waitlist.founderName')}</span>
          {' · '}
          <span class="text-fg-3">{t('waitlist.founderRole')}</span>
        </figcaption>
      </figure>
    </div>
  </section>

  <section class="px-4 pb-14 sm:px-8 lg:px-[72px] lg:pb-[76px]">
    <div class="mx-auto max-w-[720px]">
      <h2 class="mep-eyebrow m-0 mb-5">{t('waitlist.faqEyebrow')}</h2>
      <div>
        {#each faqItems as row, i}
          {@const isOpen = openFaq === i}
          <div class="border-t border-divider {i === faqItems.length - 1 ? 'border-b' : ''}">
            <h3 class="m-0">
              <button type="button" onclick={() => { openFaq = isOpen ? -1 : i; }}
                id="{faqUid}-q{i}"
                aria-expanded={isOpen}
                aria-controls={isOpen ? `${faqUid}-a${i}` : undefined}
                class="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-1 py-[18px] text-left font-[inherit]">
                <span class="w-[30px] shrink-0 font-mono text-[13px] font-semibold text-acc" aria-hidden="true">0{i + 1}</span>
                <span class="flex-1 text-[17px] font-medium tracking-[-0.01em] text-fg">{row.q}</span>
                <span class="mep-faq-toggle flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-fg-2 {isOpen ? 'is-open' : ''}" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" focusable="false">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                  </svg>
                </span>
              </button>
            </h3>
            {#if isOpen}
              <div id="{faqUid}-a{i}" role="region" aria-labelledby="{faqUid}-q{i}"
                transition:slide={{ duration: 280, easing: cubicOut }}
                class="pt-0 pr-1 pb-[18px] pl-[50px] text-[14.5px] leading-[1.65] text-fg-2">
                {row.a}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="px-4 pb-14 sm:px-8 lg:px-[72px]">
    <div class="mep-trust-bar mx-auto flex max-w-[940px] flex-col overflow-hidden rounded-card border border-divider bg-surface md:flex-row" role="list" aria-label={t('waitlist.trustBarLabel')}>
      {#each trustBarItems as item, i}
        <div class="mep-trust-bar-item flex flex-1 items-start gap-3 px-[22px] py-5" role="listitem">
          <div class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-acc-soft text-acc">
            {#if i === 0}
              <Clock size={15} />
            {:else if i === 1}
              <MessageCircle size={15} />
            {:else}
              <ShieldCheck size={15} />
            {/if}
          </div>
          <div>
            <div class="mb-[3px] text-[13px] font-semibold tracking-[-0.005em] text-fg">{item.label}</div>
            <div class="text-[13px] leading-[1.45] text-fg-2">{item.body}</div>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section class="mep-tinted-top px-4 py-16 sm:px-8 lg:px-[72px] lg:py-24">
    <div class="mx-auto flex max-w-[940px] flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="m-0 text-balance text-[clamp(28px,4vw,40px)] font-semibold leading-[1.15] tracking-[-0.025em] text-fg">{t('waitlist.closeHead')}</h2>
        <p class="mt-3.5 mb-0 max-w-[460px] text-[17px] leading-[1.6] text-fg-2">{t('waitlist.closeSub')}</p>
      </div>
      <a href="#join" class="btn btn-primary h-[52px] shrink-0 px-6 text-base font-semibold no-underline">{t('waitlist.form.submit')}</a>
    </div>
  </section>

  <footer class="flex flex-col items-start gap-2.5 border-t border-divider px-4 py-7 sm:px-8 md:flex-row md:items-center md:justify-between md:gap-5 lg:px-[72px]">
    <Logo size={20} wordmark />
    <nav class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]"
         aria-label={t('waitlist.footerLegalLabel')}>
      <a href="/privacy" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerPrivacy')}</a>
      <a href="/terms" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerTerms')}</a>
      <a href="/cookies" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerCookies')}</a>
      <a href="/refunds" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerRefunds')}</a>
      <a href="/legal" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerLegal')}</a>
    </nav>
    <div class="font-mono text-[12.5px] text-fg-3">{t('waitlist.footerNote')}</div>
  </footer>

</div>

<style>
  .mep-trust-bar-item:not(:first-child) {
    border-top: 1px solid var(--mep-divider);
  }
  @media (min-width: 48rem) {
    .mep-trust-bar-item:not(:first-child) {
      border-top: none;
      border-left: 1px solid var(--mep-divider);
    }
  }
  .mep-tinted {
    background: var(--mep-surface-2);
    border-top: 1px solid var(--mep-divider);
    border-bottom: 1px solid var(--mep-divider);
  }
  .mep-tinted-top {
    background: var(--mep-surface-2);
    border-top: 1px solid var(--mep-divider);
  }
  .mep-container { max-width: 1000px; margin: 0 auto; }
  .mep-eyebrow {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--mep-acc);
    font-family: var(--mep-fs-mono);
  }
  .mep-h2 {
    margin: 0;
    max-width: 680px;
    font-size: clamp(27px, 3.6vw, 37px);
    font-weight: 600;
    color: var(--mep-fg);
    letter-spacing: -0.025em;
    line-height: 1.15;
    text-wrap: balance;
  }
  .mep-grid-3 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
  }
  @media (min-width: 48rem) {
    .mep-grid-3 { grid-template-columns: repeat(3, 1fr); gap: 32px; }
  }
  .mep-faq-toggle { transition: transform 180ms; }
  .mep-faq-toggle.is-open { transform: rotate(45deg); }
  .mep-spot-progress {
    display: block;
    width: 100%;
    height: 5px;
    border: 0;
    border-radius: 3px;
    background: var(--mep-hover);
    overflow: hidden;
    appearance: none;
  }
  .mep-spot-progress::-webkit-progress-bar { background: var(--mep-hover); border-radius: 3px; }
  .mep-spot-progress::-webkit-progress-value { background: var(--mep-acc); border-radius: 3px; }
  .mep-spot-progress::-moz-progress-bar { background: var(--mep-acc); border-radius: 3px; }
  @media (prefers-reduced-motion: reduce) {
    .mep-faq-toggle { transition: none; }
  }
</style>
