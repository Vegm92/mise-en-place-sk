<script lang="ts">
  import { onMount } from 'svelte';
  import { toggleTheme as flipTheme, currentTheme } from '$lib/theme';
  import { browser } from '$app/environment';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import Clock from '@lucide/svelte/icons/clock';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { PROVISIONAL_PRICE, TIER_COPY, type TierId } from '$lib/billing-plans';
  import { page } from '$app/state';
  import { setLocale } from '$lib/i18n';
  import { getLocale, getT, getTi } from '$lib/i18n-context';
  import { localeHref, otherLocale } from '$lib/locale-url';
  import { overrideFor, interpolate, type LandingOverrides } from '$lib/landing-copy';
  import EmailForm from '$lib/components/waitlist/EmailForm.svelte';
  import CaptureMock from '$lib/components/waitlist/CaptureMock.svelte';
  import ExtractMock from '$lib/components/waitlist/ExtractMock.svelte';
  import DashboardMock from '$lib/components/waitlist/DashboardMock.svelte';
  import AppDashboardMock from '$lib/components/waitlist/AppDashboardMock.svelte';
  import Logo from '$lib/components/mep/Logo.svelte';

  type JoinActionData = { success?: boolean; error?: string; alreadyRegistered?: boolean } | null | undefined;

  let {
    form,
    data,
    overrides = null,
  }: {
    form: JoinActionData;
    data: { canonicalUrl: string; spotTaken: number };
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

  const PAID_TIERS: { id: TierId; price: number; recommended: boolean; quota: number | null }[] = [
    { id: 'starter',  price: PROVISIONAL_PRICE.starter,  recommended: false, quota: 100 },
    { id: 'pro',      price: PROVISIONAL_PRICE.pro,      recommended: true,  quota: 300 },
    { id: 'business', price: PROVISIONAL_PRICE.business, recommended: false, quota: null },
  ];

  let openFaq = $state(0);

  const faqUid = $props.id();

  const spotPct = $derived((data.spotTaken / SPOT_TOTAL) * 100);

  const painItems = $derived([
    {
      stat:  t('waitlist.pain.0.stat'),
      label: t('waitlist.pain.0.label'),
      title: t('waitlist.pain.0.title'),
      body:  t('waitlist.pain.0.body'),
    },
    {
      stat:  t('waitlist.pain.1.stat'),
      label: t('waitlist.pain.1.label'),
      title: t('waitlist.pain.1.title'),
      body:  t('waitlist.pain.1.body'),
    },
    {
      stat:  t('waitlist.pain.2.stat'),
      label: t('waitlist.pain.2.label'),
      title: t('waitlist.pain.2.title'),
      body:  t('waitlist.pain.2.body'),
    },
  ]);

  const compareWithoutItems = $derived([
    t('waitlist.compare.without.0'),
    t('waitlist.compare.without.1'),
    t('waitlist.compare.without.2'),
    t('waitlist.compare.without.3'),
  ]);

  const compareWithItems = $derived([
    t('waitlist.compare.with.0'),
    t('waitlist.compare.with.1'),
    t('waitlist.compare.with.2'),
    t('waitlist.compare.with.3'),
  ]);

  const stepItems = $derived([
    { num: '01', tag: t('waitlist.steps.0.tag'), title: t('waitlist.steps.0.title'), body: t('waitlist.steps.0.body') },
    { num: '02', tag: t('waitlist.steps.1.tag'), title: t('waitlist.steps.1.title'), body: t('waitlist.steps.1.body') },
    { num: '03', tag: t('waitlist.steps.2.tag'), title: t('waitlist.steps.2.title'), body: t('waitlist.steps.2.body') },
  ]);

  const foundingItems = $derived([
    { title: t('waitlist.founding.0.title'), body: t('waitlist.founding.0.body') },
    { title: t('waitlist.founding.1.title'), body: t('waitlist.founding.1.body') },
    { title: t('waitlist.founding.2.title'), body: t('waitlist.founding.2.body') },
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
      }),
    },
    { q: t('waitlist.faq.4.q'), a: t('waitlist.faq.4.a') },
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
    privacy:        t('waitlist.form.privacy'),
    privacyLink:    t('waitlist.form.privacyLink'),
    emailLabel:     t('waitlist.form.emailLabel'),
  });

  const dashboardMockCopy = $derived({
    mockSpendLabel: t('waitlist.mock.spendLabel'),
    mockCatMeat:    t('waitlist.mock.catMeat'),
    mockCatFish:    t('tpl.demo.category.pescado'),
    mockCatVeg:     t('waitlist.mock.catVeg'),
    mockAlertTitle: t('waitlist.mock.alertTitle'),
    mockReview:     t('action.review'),
  });

  const extractMockCopy = $derived({
    mockExtractedIn: t('waitlist.mock.extractedIn'),
    mockConfirmed:   t('waitlist.mock.confirmed'),
    mockLinesVat:    t('waitlist.mock.linesVat'),
  });

  const appDashboardMockCopy = $derived({
    mockKpiSpend:         t('waitlist.mock.kpiSpend'),
    mockKpiAvg:           t('waitlist.mock.kpiAvg'),
    mockKpiPending:       t('dash.kpi.pending'),
    mockKpiBudget:        t('dash.budget'),
    mockKpiOf:            t('waitlist.mock.kpiOf'),
    mockKpiInvoicesShort: t('shell.quota'),
    mockChartTitle:       t('waitlist.mock.chartTitle'),
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

  <nav class="mep-nav flex items-center gap-3.5 px-8 py-4 border-b border-divider">
    <div class="flex items-center gap-2.5">
      <Logo size={20} wordmark />
    </div>
    <span class="text-[11px] font-semibold tracking-[0.12em] uppercase text-acc px-[7px] py-0.5 rounded font-mono bg-acc-soft">{t('waitlist.betaBadge')}</span>
    <div class="flex-1"></div>
    <button onclick={toggleTheme} aria-label={t('waitlist.themeToggleLabel')} class="w-[28px] h-[28px] shrink-0 rounded-full border border-border bg-surface flex items-center justify-center cursor-pointer text-fg-2">
      {#if theme === 'dark'}<Sun size={14} />{:else}<Moon size={14} />{/if}
    </button>
    <div class="inline-flex items-center px-2.5 py-1 rounded-full border border-border bg-surface text-[11.5px] font-semibold tracking-[0.06em] text-fg-2 font-mono gap-2">
      <a href={alternateHref} hreflang={alternate} lang={alternate} rel="alternate"
         onclick={rememberLocale} class="bg-transparent border-0 cursor-pointer p-0 font-[inherit] text-[inherit] font-[inherit] tracking-[inherit] no-underline text-fg-2">{locale.current === 'es' ? 'EN' : 'ES'}</a>
    </div>
    <div class="mep-nav-signin flex items-center gap-2">
      <a href="/login" class="btn btn-secondary px-3.5 py-0 text-[13px] font-semibold no-underline whitespace-nowrap">{t('waitlist.signInLink')}</a>
      <a href="/signup" class="btn btn-primary px-3.5 py-0 text-[13px] font-semibold no-underline whitespace-nowrap">{t('signup.submit')}</a>
    </div>
  </nav>

  <section class="mep-section mep-hero pt-[108px] px-[72px] pb-24 text-center">
    <div class="mep-hero-grid grid grid-cols-2 gap-14 items-center max-w-[1180px] mx-auto">
      <div>
        <div class="max-w-[560px] mx-auto">
          <div class="mep-eyebrow mb-[26px]">
            {t('waitlist.eyebrow')}
          </div>
          <h1 class="m-0 text-[clamp(40px,5.6vw,59.5px)] font-semibold text-fg tracking-[-0.035em] leading-[1.08] text-balance">
            {t('waitlist.headline')}
          </h1>
          <p class="mt-[22px] mx-auto mb-0 max-w-[560px] text-[18.5px] leading-[1.6] text-fg-2 text-pretty">
            {t('waitlist.sub')}
          </p>
        </div>

        <div class="max-w-[460px] mx-auto mt-10" id="join">
          <EmailForm big={true} {form} copy={emailFormCopy} />
        </div>
        <div class="mep-spotbar max-w-[460px] mt-[18px] mx-auto mb-0 flex items-center gap-3.5 py-2.5 px-3.5 rounded-[10px] bg-surface border border-divider">
          <div class="flex items-baseline gap-1.5">
            <span class="text-2xl font-bold text-acc tracking-[-0.6px] leading-none font-mono">{data.spotTaken}</span>
            <span class="text-[15px] text-fg-3 font-mono">/ {SPOT_TOTAL}</span>
          </div>
          <div class="flex-1 min-w-[120px]">
            <div class="text-xs text-fg-3 uppercase tracking-[0.06em] font-medium mb-[5px] font-mono">{t('waitlist.spotLabel')}</div>
            <div class="w-full h-[5px] rounded-[3px] bg-hover overflow-hidden">
              <div class="h-full bg-acc rounded-[3px]" style="width:{spotPct}%;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="mep-hero-visual">
        <AppDashboardMock copy={appDashboardMockCopy} />
      </div>
    </div>
  </section>

  <section class="mep-section mep-tinted py-[76px] px-[72px]">
    <div class="mep-container">
      <div class="mep-eyebrow mb-3.5">{t('waitlist.painEyebrow')}</div>
      <h2 class="mep-h2">{t('waitlist.painHead')}</h2>
      <div class="mep-grid-3 mt-11">
        {#each painItems as p}
          <div class="pt-5 border-t border-border">
            <div class="flex items-baseline gap-2 mb-3.5">
              <span class="text-[44px] font-bold text-fg tracking-[-0.04em] leading-none font-mono">{p.stat}</span>
              <span class="text-[11.5px] font-medium tracking-[0.08em] uppercase text-fg-3 font-mono">{p.label}</span>
            </div>
            <div class="text-[17px] font-semibold text-fg tracking-[-0.02em] leading-[1.3] mb-2.5">{p.title}</div>
            <div class="text-sm text-fg-2 leading-[1.6]">{p.body}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section py-[76px] px-[72px]">
    <div class="max-w-[1000px] mx-auto">
      <div class="text-[11px] font-semibold tracking-[0.2em] uppercase text-acc font-mono mb-3.5">{t('waitlist.compareEyebrow')}</div>
      <h2 class="m-0 max-w-[640px] text-[32px] font-semibold text-fg tracking-[-0.025em] leading-[1.15]">{t('waitlist.compareHead')}</h2>

      <div class="mep-compare-grid mt-11 grid grid-cols-2 gap-6">
        <div class="mep-compare-card mep-compare-card-neg rounded-card border border-neg p-7">
          <div class="text-base font-semibold text-neg tracking-[-0.01em] mb-5">{t('waitlist.compare.without.title')}</div>
          <div class="flex flex-col gap-4">
            {#each compareWithoutItems as item}
              <div class="flex gap-3 items-start">
                <div class="w-[22px] h-[22px] rounded-full shrink-0 bg-neg text-neg-fg flex items-center justify-center">
                  <X size={13} />
                </div>
                <span class="text-[13px] leading-[1.5] text-fg-2 pt-0.5">{item}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="mep-compare-card mep-compare-card-pos rounded-card border border-pos p-7">
          <div class="text-base font-semibold text-pos tracking-[-0.01em] mb-5">{t('waitlist.compare.with.title')}</div>
          <div class="flex flex-col gap-4">
            {#each compareWithItems as item}
              <div class="flex gap-3 items-start">
                <div class="w-[22px] h-[22px] rounded-full shrink-0 bg-pos text-pos-fg flex items-center justify-center">
                  <Check size={13} />
                </div>
                <span class="text-[13px] leading-[1.5] text-fg pt-0.5">{item}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="mep-section py-[88px] px-[72px]">
    <div class="mep-container">
      <div class="mep-eyebrow mb-3.5">{t('waitlist.howEyebrow')}</div>
      <h2 class="mep-h2 m-0 mb-14">{t('waitlist.howHead')}</h2>

      <div class="flex flex-col gap-16">
        {#each stepItems as step, i}
          <div class="mep-how-row grid grid-cols-[360px_1fr] gap-14 items-center">
            <div>
              <div class="flex items-center gap-2.5 mb-4 text-xs font-semibold tracking-[0.2em] uppercase text-acc font-mono">
                <span class="w-7 h-5 rounded bg-acc-soft flex items-center justify-center">{step.num}</span>
                <span>{step.tag}</span>
              </div>
              <h3 class="m-0 text-2xl font-semibold text-fg tracking-[-0.01em] leading-[1.25]">{step.title}</h3>
              <p class="mt-3 mb-0 text-[15px] leading-[1.65] text-fg-2">{step.body}</p>
            </div>
            <div>
              {#if i === 0}
                <CaptureMock whatsappReply={t('waitlist.mock.whatsappReply')} />
              {:else if i === 1}
                <ExtractMock copy={extractMockCopy} />
              {:else}
                <DashboardMock copy={dashboardMockCopy} locale={locale.current} />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section py-[76px] px-[72px]">
    <div class="mep-founder-card max-w-[860px] mx-auto flex gap-6 items-start py-8 px-9 rounded-2xl bg-surface border border-divider">
      <div class="w-[92px] h-[92px] rounded-full shrink-0 bg-acc text-acc-fg flex items-center justify-center text-[31px] font-bold font-mono tracking-[-1px] border border-border">{t('waitlist.founderInitials')}</div>
      <div class="flex-1">
        <div class="text-[11.5px] font-semibold tracking-[0.14em] uppercase text-acc font-mono mb-2.5">{t('waitlist.founderEyebrow')}</div>
        <p class="m-0 text-[19px] leading-[1.55] text-fg tracking-[-0.005em]">
          &ldquo;{t('waitlist.founderBody')}&rdquo;
        </p>
        <div class="mt-3.5 text-[13px] text-fg-2">
          <span class="font-semibold text-fg">{t('waitlist.founderName')}</span>
          {' · '}
          <span class="text-fg-3">{t('waitlist.founderRole')}</span>
        </div>
      </div>
    </div>
  </section>

  <section class="mep-section mep-tinted py-[76px] px-[72px]">
    <div class="max-w-[1080px] mx-auto">
      <div class="mep-eyebrow mb-3.5">{t('waitlist.pricingEyebrow')}</div>
      <h2 class="mep-h2">{t('waitlist.pricingTitle')}</h2>
      <p class="mt-3.5 mx-0 mb-0 max-w-[620px] text-[15px] leading-[1.6] text-fg-2 text-pretty">{t('waitlist.pricingSub')}</p>

      <div class="mep-grid-4 mt-11 grid grid-cols-4 gap-3.5 items-stretch">
        <div class="card p-[20px_20px_22px] flex flex-col gap-3.5 bg-transparent border-dashed shadow-none">
          <div class="text-lg font-semibold text-fg tracking-[-0.01em]">{t('billing.tier.trial.name')}</div>
          <div>
            <div class="num text-[35px] font-semibold tracking-[-0.025em] text-fg leading-[1.1]">{t('waitlist.pricingTrialPrice')}</div>
            <div class="mt-2 text-[12.5px] text-fg-3">{t('waitlist.pricingTrialLimit')}</div>
          </div>
          <div class="text-sm text-fg-2 leading-[1.45] min-h-[34px]">{t('billing.tier.trial.tagline')}</div>
          <a href="#join" class="btn btn-secondary h-9 justify-center no-underline">{t('waitlist.form.submitShort')}</a>
        </div>

        {#each PAID_TIERS as tier}
          <div class="card p-[20px_20px_22px] flex flex-col gap-3.5 relative shadow-card {tier.recommended ? 'border-acc ring-1 ring-acc' : 'border-border'}">
            <div class="flex items-center gap-2">
              <div class="text-lg font-semibold text-fg tracking-[-0.01em]">{t(`billing.plan.${tier.id}`)}</div>
              {#if tier.recommended}
                <span class="bg-acc text-acc-fg text-xs font-medium py-0.5 px-[7px] rounded-tag">{t('billing.recommended')}</span>
              {/if}
            </div>
            <div>
              <div class="flex items-baseline gap-1.5">
                <span class="num text-[35px] font-semibold tracking-[-0.025em] text-fg border-b-2 border-dotted border-b-border-strong leading-[1.1]">{tier.price} €</span>
                <span class="text-sm text-fg-3">{t('waitlist.pricingPerMonth')}</span>
              </div>
              <div class="mt-2">
                <span class="inline-flex items-center gap-1 text-[11.5px] font-medium tracking-[0.02em] uppercase text-fg-3 border border-dashed border-border-strong rounded px-[5px] py-px">
                  {t('billing.provisional')}
                </span>
              </div>
            </div>
            <div class="text-sm text-fg-2 leading-[1.45] min-h-[34px]">{t(`billing.tier.${tier.id}.tagline`)}</div>
            <a href="#join" class="{tier.recommended ? 'btn btn-primary' : 'btn btn-secondary'} h-9 justify-center no-underline">{t('waitlist.form.submitShort')}</a>
            <div class="h-px bg-divider"></div>
            <div class="flex flex-col gap-2">
              {#each TIER_COPY[tier.id].bullets(tier.quota) as bullet}
                <div class="flex gap-2 items-start text-sm text-fg-2">
                  <span class="mt-px shrink-0 {tier.recommended ? 'text-acc' : 'text-fg-3'}">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 10.5l3.5 3.5L16 5.5"/></svg>
                  </span>
                  <span class="leading-[1.4]">{bullet.interpolate ? ti(bullet.key, bullet.interpolate) : t(bullet.key)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <p class="mt-8 mx-0 mb-0 text-[13.5px] text-fg-3 leading-[1.6] max-w-[780px] text-pretty">{t('waitlist.pricingFoot')}</p>
    </div>
  </section>

  <section class="mep-section py-[76px] px-[72px]">
    <div class="max-w-[1000px] mx-auto">
      <div class="text-[11px] font-semibold tracking-[0.2em] uppercase text-acc font-mono mb-3.5">{t('waitlist.foundingEyebrow')}</div>
      <h2 class="m-0 max-w-[640px] text-[32px] font-semibold text-fg tracking-[-0.025em] leading-[1.15]">{t('waitlist.foundingHead')}</h2>
      <p class="mt-3.5 mx-0 mb-0 max-w-[640px] text-base leading-[1.6] text-fg-2 text-pretty">{t('waitlist.foundingSub')}</p>

      <div class="mep-grid-3 mt-11 grid grid-cols-3 gap-6">
        {#each foundingItems as item, i}
          <div class="rounded-card border border-border bg-surface p-6">
            <div class="w-[30px] h-[30px] rounded-full bg-acc-soft text-acc flex items-center justify-center text-[13px] font-bold font-mono mb-4">0{i + 1}</div>
            <div class="text-base font-semibold text-fg tracking-[-0.01em] mb-2">{item.title}</div>
            <div class="text-[13px] text-fg-2 leading-[1.6]">{item.body}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section pt-0 px-[72px] pb-[76px]">
    <div class="max-w-[720px] mx-auto">
      <div class="mep-eyebrow mb-5">{t('waitlist.faqEyebrow')}</div>
      <div>
        {#each faqItems as row, i}
          {@const isOpen = openFaq === i}
          <div class="border-t border-divider {i === faqItems.length - 1 ? 'border-b border-divider' : ''}">
            <h3 class="m-0">
              <button type="button" onclick={() => { openFaq = isOpen ? -1 : i; }}
                id="{faqUid}-q{i}"
                aria-expanded={isOpen}
                aria-controls={isOpen ? `${faqUid}-a${i}` : undefined}
                class="w-full bg-transparent border-0 cursor-pointer py-[18px] px-1 flex items-center gap-4 font-[inherit] text-left">
                <span class="text-[13px] font-mono text-acc font-semibold w-[30px] shrink-0" aria-hidden="true">0{i + 1}</span>
                <span class="flex-1 text-[17px] font-medium text-fg tracking-[-0.01em]">{row.q}</span>
                <span class="w-6 h-6 rounded-full border border-border flex items-center justify-center text-fg-2 shrink-0 transition-transform duration-[180ms]"
                  aria-hidden="true"
                  class:rotate-45={isOpen}>
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

  <section class="mep-section pt-0 px-[72px] pb-14">
    <div class="mep-trust-bar max-w-[940px] mx-auto flex border border-divider rounded-card bg-surface overflow-hidden" role="list" aria-label={t('waitlist.trustBarLabel')}>
      {#each trustBarItems as item, i}
        <div class="mep-trust-bar-item flex-1 flex gap-3 items-start px-[22px] py-5" role="listitem">
          <div class="w-[30px] h-[30px] rounded-full shrink-0 bg-acc-soft text-acc flex items-center justify-center">
            {#if i === 0}
              <Clock size={15} />
            {:else if i === 1}
              <MessageCircle size={15} />
            {:else}
              <ShieldCheck size={15} />
            {/if}
          </div>
          <div>
            <div class="text-[13px] font-semibold text-fg tracking-[-0.005em] mb-[3px]">{item.label}</div>
            <div class="text-[13px] text-fg-2 leading-[1.45]">{item.body}</div>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section class="mep-section mep-tinted-top py-24 px-[72px]">
    <div class="mep-close-grid max-w-[940px] mx-auto grid grid-cols-[1fr_420px] gap-16 items-center">
      <div>
        <h2 class="m-0 text-[clamp(31px,4vw,40px)] font-semibold text-fg tracking-[-0.025em] leading-[1.15] text-balance">{t('waitlist.closeHead')}</h2>
        <p class="mt-3.5 mx-0 mb-0 text-[17px] leading-[1.6] text-fg-2 max-w-[420px]">{t('waitlist.closeSub')}</p>
      </div>
      <div class="flex flex-col gap-4">
        <EmailForm big={true} {form} copy={emailFormCopy} />
      </div>
    </div>
  </section>

  <footer class="mep-footer mep-section py-7 px-[72px] border-t border-divider flex items-center justify-between gap-5">
    <div class="flex items-center gap-2.5">
      <Logo size={20} wordmark />
    </div>
    <nav class="mep-footer-links flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]"
         aria-label={t('waitlist.footerLegalLabel')}>
      <a href="/privacy" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerPrivacy')}</a>
      <a href="/terms" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerTerms')}</a>
      <a href="/cookies" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerCookies')}</a>
      <a href="/refunds" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerRefunds')}</a>
      <a href="/legal" class="text-fg-2 underline underline-offset-2">{t('waitlist.footerLegal')}</a>
    </nav>
    <div class="text-[12.5px] text-fg-3 font-mono">{t('waitlist.footerNote')}</div>
  </footer>

</div>

<style>
  /* The soft tints are calibrated to carry their own colour as text over
     --mep-surface (ADR-026, issues #720/#749). These cards sit on a plain
     section, so the tint was compositing over --mep-bg instead and the
     heading measured 4.31:1 in light. Painting the surface underneath puts
     the pair back on the background the tint was tuned against. */
  .mep-compare-card {
    background-color: var(--mep-surface);
    background-image: linear-gradient(var(--tint), var(--tint));
  }
  .mep-compare-card-neg { --tint: var(--mep-neg-soft); }
  .mep-compare-card-pos { --tint: var(--mep-pos-soft); }

  .mep-trust-bar-item:not(:first-child) {
    border-left: 1px solid var(--mep-divider);
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
    max-width: 640px;
    font-size: clamp(31px, 3.8vw, 37.5px);
    font-weight: 600;
    color: var(--mep-fg);
    letter-spacing: -0.025em;
    line-height: 1.15;
  }
  .mep-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 40px;
  }

  @media (max-width: 960px) {
    .mep-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
    .mep-hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
    .mep-hero-visual { max-width: 560px; margin: 0 auto; }
  }

  @media (max-width: 640px) {
    .mep-nav { padding: 12px 16px !important; flex-wrap: wrap !important; row-gap: 8px !important; }
    .mep-nav-signin { flex: 1 0 100% !important; justify-content: flex-end; }
    .mep-section { padding-left: 20px !important; padding-right: 20px !important; }
    .mep-hero { padding-top: 56px !important; }
    .mep-grid-3, .mep-grid-4, .mep-compare-grid { grid-template-columns: 1fr !important; }
    .mep-trust-bar { flex-direction: column !important; }
    .mep-trust-bar-item:not(:first-child) {
      border-left: none !important;
      border-top: 1px solid var(--mep-divider);
    }
    .mep-how-row { grid-template-columns: 1fr !important; gap: 24px !important; }
    .mep-founder-card { flex-direction: column !important; }
    .mep-close-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
    .mep-footer { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
    .mep-spotbar { flex-wrap: wrap !important; }
    .mep-hero-visual { display: none !important; }
  }
</style>
