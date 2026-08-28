<script lang="ts">
  import { onMount } from 'svelte';
  import { derived } from 'svelte/store';
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
  import { t as baseT, ti as baseTi, locale, initLocale } from '$lib/i18n';
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

  const t = derived([baseT, locale], ([$baseT, $locale]) => (key: string): string => {
    return overrideFor(overrides, $locale, key) ?? $baseT(key);
  });

  const ti = derived([baseTi, locale], ([$baseTi, $locale]) => (
    key: string,
    vars: Record<string, string | number>,
  ): string => {
    const override = overrideFor(overrides, $locale, key);
    return override === undefined ? $baseTi(key, vars) : interpolate(override, vars);
  });

  let theme = $state<'light' | 'dark'>(
    browser ? currentTheme() : 'light'
  );

  onMount(() => {
    initLocale();
    const storedTheme = localStorage.getItem('mep-theme') as 'light' | 'dark' | null;
    if (storedTheme && storedTheme !== theme) theme = storedTheme;
  });

  function toggleTheme() {
    theme = flipTheme();
  }

  function toggleLocale() {
    locale.update((l) => (l === 'es' ? 'en' : 'es'));
  }

  const SPOT_TOTAL = 50;

  const PAID_TIERS: { id: TierId; price: number; recommended: boolean; quota: number | null }[] = [
    { id: 'starter',  price: PROVISIONAL_PRICE.starter,  recommended: false, quota: 100 },
    { id: 'pro',      price: PROVISIONAL_PRICE.pro,      recommended: true,  quota: 300 },
    { id: 'business', price: PROVISIONAL_PRICE.business, recommended: false, quota: null },
  ];

  let openFaq = $state(0);

  const spotPct = $derived((data.spotTaken / SPOT_TOTAL) * 100);

  const painItems = $derived([
    {
      stat:  $t('waitlist.pain.0.stat'),
      label: $t('waitlist.pain.0.label'),
      title: $t('waitlist.pain.0.title'),
      body:  $t('waitlist.pain.0.body'),
    },
    {
      stat:  $t('waitlist.pain.1.stat'),
      label: $t('waitlist.pain.1.label'),
      title: $t('waitlist.pain.1.title'),
      body:  $t('waitlist.pain.1.body'),
    },
    {
      stat:  $t('waitlist.pain.2.stat'),
      label: $t('waitlist.pain.2.label'),
      title: $t('waitlist.pain.2.title'),
      body:  $t('waitlist.pain.2.body'),
    },
  ]);

  const compareWithoutItems = $derived([
    $t('waitlist.compare.without.0'),
    $t('waitlist.compare.without.1'),
    $t('waitlist.compare.without.2'),
    $t('waitlist.compare.without.3'),
  ]);

  const compareWithItems = $derived([
    $t('waitlist.compare.with.0'),
    $t('waitlist.compare.with.1'),
    $t('waitlist.compare.with.2'),
    $t('waitlist.compare.with.3'),
  ]);

  const stepItems = $derived([
    { num: '01', tag: $t('waitlist.steps.0.tag'), title: $t('waitlist.steps.0.title'), body: $t('waitlist.steps.0.body') },
    { num: '02', tag: $t('waitlist.steps.1.tag'), title: $t('waitlist.steps.1.title'), body: $t('waitlist.steps.1.body') },
    { num: '03', tag: $t('waitlist.steps.2.tag'), title: $t('waitlist.steps.2.title'), body: $t('waitlist.steps.2.body') },
  ]);

  const testimonialItems = $derived([
    { quote: $t('waitlist.testimonials.0.quote'), name: $t('waitlist.testimonials.0.name'), role: $t('waitlist.testimonials.0.role') },
    { quote: $t('waitlist.testimonials.1.quote'), name: $t('waitlist.testimonials.1.name'), role: $t('waitlist.testimonials.1.role') },
    { quote: $t('waitlist.testimonials.2.quote'), name: $t('waitlist.testimonials.2.name'), role: $t('waitlist.testimonials.2.role') },
  ]);

  const foundingItems = $derived([
    { title: $t('waitlist.founding.0.title'), body: $t('waitlist.founding.0.body') },
    { title: $t('waitlist.founding.1.title'), body: $t('waitlist.founding.1.body') },
    { title: $t('waitlist.founding.2.title'), body: $t('waitlist.founding.2.body') },
  ]);

  const trustBarItems = $derived([
    { label: $t('waitlist.trustBar.cadence.label'), body: $t('waitlist.trustBar.cadence.body') },
    { label: $t('waitlist.trustBar.support.label'), body: $t('waitlist.trustBar.support.body') },
    { label: $t('waitlist.trustBar.privacy.label'), body: $t('waitlist.trustBar.privacy.body') },
  ]);

  const faqItems = $derived([
    { q: $t('waitlist.faq.0.q'), a: $t('waitlist.faq.0.a') },
    { q: $t('waitlist.faq.1.q'), a: $t('waitlist.faq.1.a') },
    { q: $t('waitlist.faq.2.q'), a: $t('waitlist.faq.2.a') },
    {
      q: $t('waitlist.faq.3.q'),
      a: $ti('waitlist.faq.3.a', {
        starter: PROVISIONAL_PRICE.starter,
        pro: PROVISIONAL_PRICE.pro,
        business: PROVISIONAL_PRICE.business,
      }),
    },
    { q: $t('waitlist.faq.4.q'), a: $t('waitlist.faq.4.a') },
  ]);

  const emailFormCopy = $derived({
    placeholder:    $t('login.emailPlaceholder'),
    submit:         $t('waitlist.form.submit'),
    submitShort:    $t('waitlist.form.submitShort'),
    success:        $t('waitlist.form.success'),
    successBody:    $t('waitlist.form.successBody'),
    alreadyReg:     $t('waitlist.form.alreadyReg'),
    errRequired:    $t('waitlist.form.errRequired'),
    errInvalid:     $t('waitlist.form.errInvalid'),
    errRateLimited: $t('waitlist.form.errRateLimited'),
    errBot:         $t('signup.err.bot'),
    privacy:        $t('waitlist.form.privacy'),
  });

  const dashboardMockCopy = $derived({
    mockSpendLabel: $t('waitlist.mock.spendLabel'),
    mockCatMeat:    $t('waitlist.mock.catMeat'),
    mockCatFish:    $t('tpl.demo.category.pescado'),
    mockCatVeg:     $t('waitlist.mock.catVeg'),
    mockAlertTitle: $t('waitlist.mock.alertTitle'),
    mockReview:     $t('action.review'),
  });

  const extractMockCopy = $derived({
    mockExtractedIn: $t('waitlist.mock.extractedIn'),
    mockConfirmed:   $t('waitlist.mock.confirmed'),
    mockLinesVat:    $t('waitlist.mock.linesVat'),
  });

  const appDashboardMockCopy = $derived({
    mockKpiSpend:         $t('waitlist.mock.kpiSpend'),
    mockKpiAvg:           $t('waitlist.mock.kpiAvg'),
    mockKpiPending:       $t('dash.kpi.pending'),
    mockKpiBudget:        $t('dash.budget'),
    mockKpiOf:            $t('waitlist.mock.kpiOf'),
    mockKpiInvoicesShort: $t('shell.quota'),
    mockChartTitle:       $t('waitlist.mock.chartTitle'),
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
  <title>{$t('waitlist.pageTitle')}</title>
  <meta name="description" content={$t('waitlist.metaDescription')} />
  <link rel="canonical" href={data.canonicalUrl} />

  <meta property="og:type"        content="website" />
  <meta property="og:url"         content={data.canonicalUrl} />
  <meta property="og:site_name"   content="Mise en Place" />
  <meta property="og:title"       content={$t('waitlist.ogTitle')} />
  <meta property="og:description" content={$t('waitlist.metaDescription')} />
  <meta property="og:locale"      content={$locale === 'es' ? 'es_ES' : 'en_US'} />

  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content={$t('waitlist.ogTitle')} />
  <meta name="twitter:description" content={$t('waitlist.metaDescription')} />

  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'Mise en Place',
        url: siteRoot,
        inLanguage: $locale === 'es' ? 'es' : 'en',
        potentialAction: { '@type': 'RegisterAction', target: data.canonicalUrl + '#join' },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Mise en Place',
        description: $t('waitlist.metaDescription'),
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: $t('waitlist.jsonLdOfferDescription') },
        creator: { '@type': 'Organization', name: 'Mise en Place', address: { '@type': 'PostalAddress', addressLocality: 'Barcelona', addressCountry: 'ES' } },
      },
    ],
  }).replace(/</g, '\\u003c')}</script>`}
</svelte:head>

<div class="mep" data-accent="tinta"
  style="width:100%;min-height:100vh;background:var(--mep-bg);color:var(--mep-fg);font-family:inherit;">

  <nav class="mep-nav" style="display:flex;align-items:center;gap:14px;padding:16px 32px;
              border-bottom:1px solid var(--mep-divider);">
    <div style="display:flex;align-items:center;gap:10px;">
      <Logo size={18} />
      <span style="font-size:17px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">Mise en Place</span>
    </div>
    <span style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;
                 color:var(--mep-acc);padding:2px 7px;border-radius:4px;
                 background:var(--mep-acc-soft);font-family:var(--mep-fs-mono);">{$t('waitlist.betaBadge')}</span>
    <div style="flex:1;"></div>
    <button onclick={toggleTheme} aria-label={$t('waitlist.themeToggleLabel')} style="width:28px;height:28px;flex-shrink:0;
                border-radius:999px;border:1px solid var(--mep-border);background:var(--mep-surface);
                display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mep-fg-2);">
      {#if theme === 'dark'}<Sun size={14} />{:else}<Moon size={14} />{/if}
    </button>
    <div style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;
                border:1px solid var(--mep-border);background:var(--mep-surface);
                font-size:11.5px;font-weight:600;letter-spacing:0.06em;color:var(--mep-fg-2);
                font-family:var(--mep-fs-mono);gap:8px;">
      <button onclick={toggleLocale} style="background:transparent;border:none;cursor:pointer;
                                            padding:0;font-family:inherit;font-size:inherit;
                                            font-weight:inherit;letter-spacing:inherit;
                                            color:var(--mep-fg-2);">{$locale === 'es' ? 'EN' : 'ES'}</button>
    </div>
    <div class="mep-nav-signin" style="display:flex;align-items:center;gap:8px;">
      <a href="/login" class="btn btn-secondary" style="padding:0 14px;font-size:13px;
                                                       font-weight:600;text-decoration:none;
                                                       white-space:nowrap;">{$t('waitlist.signInLink')}</a>
      <a href="/signup" class="btn btn-primary" style="padding:0 14px;font-size:13px;
                                                      font-weight:600;text-decoration:none;
                                                      white-space:nowrap;">{$t('signup.submit')}</a>
    </div>
  </nav>

  <section class="mep-section mep-hero" style="padding:108px 72px 96px;text-align:center;">
    <div class="mep-hero-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:56px;
                align-items:center;max-width:1180px;margin:0 auto;">
      <div>
        <div style="max-width:560px;margin:0 auto;">
          <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                      color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:26px;">
            {$t('waitlist.eyebrow')}
          </div>
          <h1 style="margin:0;font-size:clamp(40px,5.6vw,59.5px);font-weight:600;color:var(--mep-fg);
                     letter-spacing:-0.035em;line-height:1.08;text-wrap:balance;">
            {$t('waitlist.headline')}
          </h1>
          <p style="margin:22px auto 0;max-width:560px;font-size:18.5px;line-height:1.6;
                    color:var(--mep-fg-2);text-wrap:pretty;">
            {$t('waitlist.sub')}
          </p>
        </div>

        <div style="max-width:460px;margin:40px auto 0;" id="join">
          <EmailForm big={true} {form} copy={emailFormCopy} />
        </div>
        <div class="mep-spotbar" style="max-width:460px;margin:18px auto 0;display:flex;align-items:center;gap:14px;
                    padding:10px 14px;border-radius:10px;background:var(--mep-surface);
                    border:1px solid var(--mep-divider);">
          <div style="display:flex;align-items:baseline;gap:6px;">
            <span style="font-size:24px;font-weight:700;color:var(--mep-acc);letter-spacing:-0.6px;
                         line-height:1;font-family:var(--mep-fs-mono);">{data.spotTaken}</span>
            <span style="font-size:15px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">/ {SPOT_TOTAL}</span>
          </div>
          <div style="flex:1;min-width:120px;">
            <div style="font-size:12px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.06em;
                        font-weight:500;margin-bottom:5px;font-family:var(--mep-fs-mono);">{$t('waitlist.spotLabel')}</div>
            <div style="width:100%;height:5px;border-radius:3px;background:var(--mep-hover);overflow:hidden;">
              <div style="width:{spotPct}%;height:100%;background:var(--mep-acc);border-radius:3px;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="mep-hero-visual">
        <AppDashboardMock copy={appDashboardMockCopy} />
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;background:var(--mep-surface-2);
                  border-top:1px solid var(--mep-divider);border-bottom:1px solid var(--mep-divider);">
    <div style="max-width:1000px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:14px;">{$t('waitlist.painEyebrow')}</div>
      <h2 style="margin:0;max-width:640px;font-size:clamp(31px,3.8vw,37.5px);font-weight:600;
                 color:var(--mep-fg);letter-spacing:-0.025em;line-height:1.15;">{$t('waitlist.painHead')}</h2>
      <div class="mep-grid-3" style="margin-top:44px;display:grid;grid-template-columns:repeat(3,1fr);gap:40px;">
        {#each painItems as p}
          <div style="padding-top:20px;border-top:1px solid var(--mep-border);">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:14px;">
              <span style="font-size:44px;font-weight:700;color:var(--mep-fg);letter-spacing:-0.04em;
                           line-height:1;font-family:var(--mep-fs-mono);">{p.stat}</span>
              <span style="font-size:11.5px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;
                           color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">{p.label}</span>
            </div>
            <div style="font-size:17px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.02em;
                        line-height:1.3;margin-bottom:10px;">{p.title}</div>
            <div style="font-size:14px;color:var(--mep-fg-2);line-height:1.6;">{p.body}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;">
    <div style="max-width:1000px;margin:0 auto;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:14px;">{$t('waitlist.compareEyebrow')}</div>
      <h2 style="margin:0;max-width:640px;font-size:32px;font-weight:600;
                 color:var(--mep-fg);letter-spacing:-0.025em;line-height:1.15;">{$t('waitlist.compareHead')}</h2>

      <div class="mep-compare-grid" style="margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div style="border-radius:var(--mep-r-card);border:1px solid var(--mep-neg);
                    background:var(--mep-neg-soft);padding:28px;">
          <div style="font-size:16px;font-weight:600;color:var(--mep-neg);letter-spacing:-0.01em;
                      margin-bottom:20px;">{$t('waitlist.compare.without.title')}</div>
          <div style="display:flex;flex-direction:column;gap:16px;">
            {#each compareWithoutItems as item}
              <div style="display:flex;gap:12px;align-items:flex-start;">
                <div style="width:22px;height:22px;border-radius:999px;flex-shrink:0;
                            background:var(--mep-neg);color:var(--mep-neg-fg);
                            display:flex;align-items:center;justify-content:center;">
                  <X size={13} />
                </div>
                <span style="font-size:13px;line-height:1.5;color:var(--mep-fg-2);padding-top:2px;">{item}</span>
              </div>
            {/each}
          </div>
        </div>

        <div style="border-radius:var(--mep-r-card);border:1px solid var(--mep-pos);
                    background:var(--mep-pos-soft);padding:28px;">
          <div style="font-size:16px;font-weight:600;color:var(--mep-pos);letter-spacing:-0.01em;
                      margin-bottom:20px;">{$t('waitlist.compare.with.title')}</div>
          <div style="display:flex;flex-direction:column;gap:16px;">
            {#each compareWithItems as item}
              <div style="display:flex;gap:12px;align-items:flex-start;">
                <div style="width:22px;height:22px;border-radius:999px;flex-shrink:0;
                            background:var(--mep-pos);color:var(--mep-pos-fg);
                            display:flex;align-items:center;justify-content:center;">
                  <Check size={13} />
                </div>
                <span style="font-size:13px;line-height:1.5;color:var(--mep-fg);padding-top:2px;">{item}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:88px 72px;">
    <div style="max-width:1000px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:14px;">{$t('waitlist.howEyebrow')}</div>
      <h2 style="margin:0 0 56px;max-width:640px;font-size:clamp(31px,3.8vw,37.5px);font-weight:600;
                 color:var(--mep-fg);letter-spacing:-0.025em;line-height:1.15;">{$t('waitlist.howHead')}</h2>

      <div style="display:flex;flex-direction:column;gap:64px;">
        {#each stepItems as step, i}
          <div class="mep-how-row" style="display:grid;grid-template-columns:360px 1fr;gap:56px;align-items:center;">
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;
                          font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                          color:var(--mep-acc);font-family:var(--mep-fs-mono);">
                <span style="width:28px;height:20px;border-radius:4px;background:var(--mep-acc-soft);
                             display:flex;align-items:center;justify-content:center;">{step.num}</span>
                <span>{step.tag}</span>
              </div>
              <h3 style="margin:0;font-size:24px;font-weight:600;color:var(--mep-fg);
                         letter-spacing:-0.01em;line-height:1.25;">{step.title}</h3>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.65;color:var(--mep-fg-2);">{step.body}</p>
            </div>
            <div>
              {#if i === 0}
                <CaptureMock whatsappReply={$t('waitlist.mock.whatsappReply')} />
              {:else if i === 1}
                <ExtractMock copy={extractMockCopy} />
              {:else}
                <DashboardMock copy={dashboardMockCopy} locale={$locale} />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;background:var(--mep-surface-2);
                  border-top:1px solid var(--mep-divider);border-bottom:1px solid var(--mep-divider);">
    <div style="max-width:1000px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:40px;">{$t('waitlist.testimonialsEyebrow')}</div>
      <div class="mep-grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:40px;">
        {#each testimonialItems as item}
          <div style="padding-top:22px;border-top:1px solid var(--mep-border);">
            <p style="margin:0;font-size:17px;line-height:1.6;color:var(--mep-fg);letter-spacing:-0.005em;">
              &ldquo;{item.quote}&rdquo;
            </p>
            <div style="margin-top:18px;font-size:13.5px;color:var(--mep-fg-2);">
              <span style="font-weight:600;color:var(--mep-fg);">{item.name}</span>
            </div>
            <div style="font-size:12.5px;color:var(--mep-fg-3);margin-top:3px;">{item.role}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;">
    <div class="mep-founder-card" style="max-width:860px;margin:0 auto;display:flex;gap:24px;align-items:flex-start;
                padding:32px 36px;border-radius:16px;background:var(--mep-surface);border:1px solid var(--mep-divider);">
      <div style="width:92px;height:92px;border-radius:50%;flex-shrink:0;
                  background:linear-gradient(135deg,var(--mep-acc-soft) 0%,var(--mep-acc) 200%);
                  color:var(--mep-acc-fg);display:flex;align-items:center;justify-content:center;
                  font-size:31px;font-weight:700;font-family:var(--mep-fs-mono);letter-spacing:-1px;
                  border:1px solid var(--mep-border);">{$t('waitlist.founderInitials')}</div>
      <div style="flex:1;">
        <div style="font-size:11.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;
                    color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:10px;">{$t('waitlist.founderEyebrow')}</div>
        <p style="margin:0;font-size:19px;line-height:1.55;color:var(--mep-fg);letter-spacing:-0.005em;">
          &ldquo;{$t('waitlist.founderBody')}&rdquo;
        </p>
        <div style="margin-top:14px;font-size:13px;color:var(--mep-fg-2);">
          <span style="font-weight:600;color:var(--mep-fg);">{$t('waitlist.founderName')}</span>
          {' · '}
          <span style="color:var(--mep-fg-3);">{$t('waitlist.founderRole')}</span>
        </div>
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;background:var(--mep-surface-2);border-top:1px solid var(--mep-divider);border-bottom:1px solid var(--mep-divider);">
    <div style="max-width:1080px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:14px;">{$t('waitlist.pricingEyebrow')}</div>
      <h2 style="margin:0;max-width:640px;font-size:clamp(31px,3.8vw,37.5px);font-weight:600;
                 color:var(--mep-fg);letter-spacing:-0.025em;line-height:1.15;">{$t('waitlist.pricingTitle')}</h2>
      <p style="margin:14px 0 0;max-width:620px;font-size:15px;line-height:1.6;color:var(--mep-fg-2);text-wrap:pretty;">{$t('waitlist.pricingSub')}</p>

      <div class="mep-grid-4" style="margin-top:44px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:stretch;">
        <div class="card" style="padding:20px 20px 22px;display:flex;flex-direction:column;gap:14px;
                    background:transparent;border-style:dashed;box-shadow:none;">
          <div style="font-size:18px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.01em;">{$t('billing.tier.trial.name')}</div>
          <div>
            <div class="num" style="font-size:35px;font-weight:600;letter-spacing:-0.025em;color:var(--mep-fg);line-height:1.1;">{$t('waitlist.pricingTrialPrice')}</div>
            <div style="margin-top:8px;font-size:12.5px;color:var(--mep-fg-3);">{$t('waitlist.pricingTrialLimit')}</div>
          </div>
          <div style="font-size:14px;color:var(--mep-fg-2);line-height:1.45;min-height:34px;">{$t('billing.tier.trial.tagline')}</div>
          <a href="#join" class="btn btn-secondary" style="height:36px;justify-content:center;text-decoration:none;">{$t('waitlist.form.submitShort')}</a>
        </div>

        {#each PAID_TIERS as tier}
          <div class="card" style="padding:20px 20px 22px;display:flex;flex-direction:column;gap:14px;position:relative;
                      border-color:{tier.recommended ? 'var(--mep-acc)' : 'var(--mep-border)'};
                      box-shadow:{tier.recommended ? '0 0 0 1px var(--mep-acc), var(--mep-shadow-card)' : 'var(--mep-shadow-card)'};">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="font-size:18px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.01em;">{$t(`billing.plan.${tier.id}`)}</div>
              {#if tier.recommended}
                <span style="background:var(--mep-acc);color:var(--mep-acc-fg);font-size:12px;font-weight:500;padding:2px 7px;border-radius:var(--mep-r-tag);">{$t('billing.recommended')}</span>
              {/if}
            </div>
            <div>
              <div style="display:flex;align-items:baseline;gap:6px;">
                <span class="num" style="font-size:35px;font-weight:600;letter-spacing:-0.025em;color:var(--mep-fg);
                  border-bottom:2px dotted var(--mep-border-strong);line-height:1.1;">{tier.price} €</span>
                <span style="font-size:14px;color:var(--mep-fg-3);">{$t('waitlist.pricingPerMonth')}</span>
              </div>
              <div style="margin-top:8px;">
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;
                  letter-spacing:0.02em;text-transform:uppercase;color:var(--mep-fg-3);
                  border:1px dashed var(--mep-border-strong);border-radius:4px;padding:1px 5px;">
                  {$t('billing.provisional')}
                </span>
              </div>
            </div>
            <div style="font-size:14px;color:var(--mep-fg-2);line-height:1.45;min-height:34px;">{$t(`billing.tier.${tier.id}.tagline`)}</div>
            <a href="#join" class={tier.recommended ? 'btn btn-primary' : 'btn btn-secondary'} style="height:36px;justify-content:center;text-decoration:none;">{$t('waitlist.form.submitShort')}</a>
            <div style="height:1px;background:var(--mep-divider);"></div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              {#each TIER_COPY[tier.id].bullets(tier.quota) as bullet}
                <div style="display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--mep-fg-2);">
                  <span style="color:{tier.recommended ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};margin-top:1px;flex-shrink:0;">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l3.5 3.5L16 5.5"/></svg>
                  </span>
                  <span style="line-height:1.4;">{bullet.interpolate ? $ti(bullet.key, bullet.interpolate) : $t(bullet.key)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <p style="margin:32px 0 0;font-size:13.5px;color:var(--mep-fg-3);line-height:1.6;max-width:780px;text-wrap:pretty;">{$t('waitlist.pricingFoot')}</p>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;">
    <div style="max-width:1000px;margin:0 auto;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:14px;">{$t('waitlist.foundingEyebrow')}</div>
      <h2 style="margin:0;max-width:640px;font-size:32px;font-weight:600;
                 color:var(--mep-fg);letter-spacing:-0.025em;line-height:1.15;">{$t('waitlist.foundingHead')}</h2>
      <p style="margin:14px 0 0;max-width:640px;font-size:16px;line-height:1.6;color:var(--mep-fg-2);text-wrap:pretty;">{$t('waitlist.foundingSub')}</p>

      <div class="mep-grid-3" style="margin-top:44px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">
        {#each foundingItems as item, i}
          <div style="border-radius:var(--mep-r-card);border:1px solid var(--mep-border);
                      background:var(--mep-surface);padding:24px;">
            <div style="width:30px;height:30px;border-radius:999px;background:var(--mep-acc-soft);
                        color:var(--mep-acc);display:flex;align-items:center;justify-content:center;
                        font-size:13px;font-weight:700;font-family:var(--mep-fs-mono);margin-bottom:16px;">0{i + 1}</div>
            <div style="font-size:16px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.01em;margin-bottom:8px;">{item.title}</div>
            <div style="font-size:13px;color:var(--mep-fg-2);line-height:1.6;">{item.body}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:0 72px 76px;">
    <div style="max-width:720px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:20px;">{$t('waitlist.faqEyebrow')}</div>
      <div>
        {#each faqItems as row, i}
          {@const isOpen = openFaq === i}
          <div style="border-top:1px solid var(--mep-divider);
                      {i === faqItems.length - 1 ? 'border-bottom:1px solid var(--mep-divider);' : ''}">
            <button onclick={() => { openFaq = isOpen ? -1 : i; }}
              style="width:100%;background:transparent;border:0;cursor:pointer;padding:18px 4px;
                     display:flex;align-items:center;gap:16px;font-family:inherit;text-align:left;">
              <span style="font-size:13px;font-family:var(--mep-fs-mono);color:var(--mep-acc);
                           font-weight:600;width:30px;flex-shrink:0;">0{i + 1}</span>
              <span style="flex:1;font-size:17px;font-weight:500;color:var(--mep-fg);letter-spacing:-0.01em;">{row.q}</span>
              <span style="width:24px;height:24px;border-radius:50%;border:1px solid var(--mep-border);
                           display:flex;align-items:center;justify-content:center;color:var(--mep-fg-2);
                           transform:rotate({isOpen ? '45deg' : '0'});transition:transform 180ms;flex-shrink:0;">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </span>
            </button>
            {#if isOpen}
              <div transition:slide={{ duration: 280, easing: cubicOut }}
                style="padding:0 4px 18px 50px;font-size:14.5px;line-height:1.65;color:var(--mep-fg-2);">
                {row.a}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:0 72px 56px;">
    <div class="mep-trust-bar" role="list" aria-label={$t('waitlist.trustBarLabel')}
      style="max-width:940px;margin:0 auto;display:flex;border:1px solid var(--mep-divider);
             border-radius:var(--mep-r-card);background:var(--mep-surface);overflow:hidden;">
      {#each trustBarItems as item, i}
        <div class="mep-trust-bar-item" role="listitem"
          style="flex:1;display:flex;gap:12px;align-items:flex-start;padding:20px 22px;">
          <div style="width:30px;height:30px;border-radius:999px;flex-shrink:0;
                      background:var(--mep-acc-soft);color:var(--mep-acc);
                      display:flex;align-items:center;justify-content:center;">
            {#if i === 0}
              <Clock size={15} />
            {:else if i === 1}
              <MessageCircle size={15} />
            {:else}
              <ShieldCheck size={15} />
            {/if}
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.005em;margin-bottom:3px;">{item.label}</div>
            <div style="font-size:13px;color:var(--mep-fg-2);line-height:1.45;">{item.body}</div>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section class="mep-section" style="padding:96px 72px;background:var(--mep-surface-2);border-top:1px solid var(--mep-divider);">
    <div class="mep-close-grid" style="max-width:940px;margin:0 auto;display:grid;grid-template-columns:1fr 420px;
                gap:64px;align-items:center;">
      <div>
        <h2 style="margin:0;font-size:clamp(31px,4vw,40px);font-weight:600;color:var(--mep-fg);
                   letter-spacing:-0.025em;line-height:1.15;text-wrap:balance;">{$t('waitlist.closeHead')}</h2>
        <p style="margin:14px 0 0;font-size:17px;line-height:1.6;color:var(--mep-fg-2);max-width:420px;">{$t('waitlist.closeSub')}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <EmailForm big={true} {form} copy={emailFormCopy} />
      </div>
    </div>
  </section>

  <footer class="mep-footer mep-section" style="padding:28px 72px;border-top:1px solid var(--mep-divider);
                 display:flex;align-items:center;justify-content:space-between;gap:20px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <Logo size={18} />
      <span style="font-size:17px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">Mise en Place</span>
    </div>
    <div style="font-size:12.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">{$t('waitlist.footerNote')}</div>
  </footer>

</div>

<style>
  .mep-trust-bar-item:not(:first-child) {
    border-left: 1px solid var(--mep-divider);
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
