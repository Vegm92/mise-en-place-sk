<script lang="ts">
  import { goto } from '$app/navigation';
  import { t, ti, tp } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import { HELP_STEPS, HELP_TIPS, HELP_FAQ } from '$lib/help-content';
  import { TOUR_PAGES } from '$lib/tour-gating';
  import { setTutorialStep } from '$lib/stores/tutorial.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Compass from '@lucide/svelte/icons/compass';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import FileText from '@lucide/svelte/icons/file-text';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Tag from '@lucide/svelte/icons/tag';
  import Bell from '@lucide/svelte/icons/bell';
  import Truck from '@lucide/svelte/icons/truck';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Settings from '@lucide/svelte/icons/settings';

  const TIP_ICONS: Record<string, typeof TrendingUp> = {
    dashboard: LayoutDashboard,
    invoices:  FileText,
    suppliers: Truck,
    analytics: TrendingUp,
    budgets:   Tag,
    reminders: Bell,
    reports:   Newspaper,
    chat:      MessageCircle,
    settings:  Settings,
  };

  let startingTour = $state(false);

  async function startTour() {
    startingTour = true;
    await setTutorialStep('3');
    await goto('/dashboard');
  }

  const areas = $derived([
    { id: 'steps', label: t('help.nav.steps'), title: t('help.start.title'), sub: t('help.start.sub'), icon: CirclePlay },
    { id: 'tour',  label: t('help.nav.tour'),  title: t('help.tour.title'),  sub: t('help.tour.sub'),  icon: Compass },
    { id: 'tips',  label: t('help.nav.tips'),  title: t('help.tips.title'),  sub: t('help.tips.sub'),  icon: Lightbulb },
    { id: 'faq',   label: t('help.nav.faq'),   title: t('help.faq.title'),   sub: t('help.faq.sub'),   icon: CircleHelp },
  ]);

  let area = $state('steps');
  let query = $state('');

  const areaOf = (id: string) => areas.find((a) => a.id === id) ?? areas[0]!;

  const searchIndex = $derived([
    ...HELP_STEPS.map((step) => ({ key: `help.start.${step.key}.title`, body: `help.start.${step.key}.body`, area: 'steps' })),
    ...HELP_TIPS.map((tip) => ({ key: `help.tip.${tip.key}.title`, body: `help.tip.${tip.key}.body`, area: 'tips' })),
    ...HELP_FAQ.map((item) => ({ key: `help.faq.${item}.q`, body: `help.faq.${item}.a`, area: 'faq' })),
  ]);

  const results = $derived(
    query.trim().length === 0
      ? []
      : searchIndex.filter((entry) =>
          `${t(entry.key)} ${t(entry.body)}`.toLowerCase().includes(query.trim().toLowerCase()),
        ),
  );

  const searching = $derived(query.trim().length > 0);

  function goToArea(next: string) {
    query = '';
    area = next;
  }

  const excerpt = (value: string) => (value.length > 96 ? `${value.slice(0, 96)}…` : value);
</script>

<div class="help-shell" data-coach="help-main">
  <nav class="help-rail">
    <div class="help-search">
      <Search size={13} style="color:var(--mep-fg-3);flex-shrink:0;" />
      <input type="text" bind:value={query} placeholder={t('help.search')} aria-label={t('help.search')} />
      {#if searching}
        <button type="button" class="help-search-clear" aria-label={t('help.searchClear')} onclick={() => (query = '')}>
          <X size={13} />
        </button>
      {/if}
    </div>

    {#each areas as a (a.id)}
      <button
        type="button"
        class="help-rail-item"
        class:active={area === a.id && !searching}
        onclick={() => goToArea(a.id)}
      >
        <a.icon size={15} /><span>{a.label}</span>
      </button>
    {/each}

    <span class="help-rail-spacer"></span>
    <div class="help-rail-foot">
      <p class="help-hint">{t('help.assistant.hint')}</p>
      <a href="/chat" class="btn btn-secondary help-rail-btn">
        <MessageCircle size={13} /> {t('help.assistant.btn')}
      </a>
    </div>
  </nav>

  <div class="help-content">
    {#if searching}
      <div class="card help-results">
        <div class="card-header"><span class="subtitle">{tp('help.searchCount', results.length)}</span></div>
        {#each results as entry (entry.key)}
          <button type="button" class="help-result" onclick={() => goToArea(entry.area)}>
            <span class="help-result-copy">
              <span class="body-strong">{t(entry.key)}</span>
              <span class="help-hint">{excerpt(t(entry.body))}</span>
            </span>
            <span class="badge badge-neutral">{areaOf(entry.area).label}</span>
            <ChevronRight size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
          </button>
        {:else}
          <div class="help-empty"><p class="body">{t('help.searchEmpty')}</p></div>
        {/each}
      </div>
    {:else}
      <div class="help-head">
        <h2 class="title help-head-title">{areaOf(area).title}</h2>
        <p class="body help-lede">{areaOf(area).sub}</p>
      </div>

      {#if area === 'steps'}
        <div class="card help-card">
          <ol class="help-steps">
            {#each HELP_STEPS as step, i (step.key)}
              <li class="help-step">
                <span class="help-step-num num" aria-label={ti('help.step', { n: i + 1 })}>{i + 1}</span>
                <div class="help-step-body">
                  <div class="body-strong">{t(`help.start.${step.key}.title`)}</div>
                  <p class="body help-prose">{t(`help.start.${step.key}.body`)}</p>
                  {#if step.href && step.actionKey}
                    <a href={step.href} class="btn btn-ghost help-action">
                      {t(step.actionKey)} <ArrowRight size={12} />
                    </a>
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
        </div>

        <button type="button" class="card help-teaser" onclick={() => goToArea('tour')}>
          <span class="help-icon"><Compass size={17} /></span>
          <span class="help-teaser-copy">
            <span class="body-strong">{t('help.tourTeaser')}</span>
            <span class="help-hint">{t('help.tourTeaserBody')}</span>
          </span>
          <ChevronRight size={15} style="color:var(--mep-fg-3);flex-shrink:0;" />
        </button>
      {/if}

      {#if area === 'tour'}
        <SectionCard title={t('help.tour.title')}>
          <div class="help-tour">
            <span class="help-icon help-icon-lg"><Compass size={22} /></span>
            <div class="help-step-body">
              <p class="body help-prose">{t('help.tour.body')}</p>
              <div class="help-stops">
                {#each TOUR_PAGES as page, i (page.step)}
                  <span class="help-stop">
                    <span class="help-stop-num num">{i + 1}</span>
                    {t(`help.tip.${page.tip}.title`)}
                  </span>
                {/each}
              </div>
              <button type="button" class="btn btn-primary help-action" onclick={startTour} disabled={startingTour}>
                {t('help.tour.btn')} <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </SectionCard>
      {/if}

      {#if area === 'tips'}
        <div class="help-tips">
          {#each HELP_TIPS as tip (tip.key)}
            {@const Icon = TIP_ICONS[tip.key]}
            <div class="help-tip">
              <div class="help-tip-head">
                <Icon size={15} />
                <span class="body-strong">{t(`help.tip.${tip.key}.title`)}</span>
                {#if tip.pro}<span class="help-tip-pro">{t('nav.badge.pro')}</span>{/if}
              </div>
              <p class="body help-prose help-tip-body">{t(`help.tip.${tip.key}.body`)}</p>
              <a href={tip.href} class="btn btn-ghost help-action">
                {t(`help.tip.${tip.key}.action`)} <ArrowRight size={12} />
              </a>
            </div>
          {/each}
        </div>
      {/if}

      {#if area === 'faq'}
        <div class="card help-faq">
          {#each HELP_FAQ as item, i (item)}
            <details class="help-faq-item" open={i === 0}>
              <summary class="help-faq-q">
                <span class="body-strong">{t(`help.faq.${item}.q`)}</span>
                <span class="help-faq-chevron"><ChevronDown size={14} /></span>
              </summary>
              <p class="body help-prose help-faq-a">{t(`help.faq.${item}.a`)}</p>
            </details>
          {/each}
        </div>

        <a href="/settings" class="card help-teaser">
          <span class="help-icon"><Settings size={17} /></span>
          <span class="help-teaser-copy">
            <span class="body-strong">{t('help.more.title')}</span>
            <span class="help-hint">{t('help.more.body')}</span>
          </span>
          <ChevronRight size={15} style="color:var(--mep-fg-3);flex-shrink:0;" />
        </a>
      {/if}
    {/if}
  </div>
</div>

<style>
  .help-shell { flex: 1; min-height: 0; display: flex; }

  .help-rail {
    width: 224px;
    flex-shrink: 0;
    padding: 18px 12px;
    border-right: 1px solid var(--mep-divider);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .help-rail-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 10px;
    height: 34px;
    border-radius: var(--mep-r-input);
    border: 0;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    background: transparent;
    color: var(--mep-fg-2);
    font-size: 13px;
    transition: background 150ms ease-out, color 150ms ease-out;
  }
  .help-rail-item:hover { background: var(--mep-hover); color: var(--mep-fg); }
  .help-rail-item.active { background: var(--mep-acc-soft); color: var(--mep-acc); font-weight: 500; }
  .help-rail-spacer { flex: 1; }
  .help-rail-foot { padding: 12px 10px 0; border-top: 1px solid var(--mep-divider); }
  .help-rail-btn { width: 100%; height: 30px; font-size: 12.5px; text-decoration: none; margin-top: 8px; }

  .help-search {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 9px;
    border-radius: var(--mep-r-input);
    border: 1px solid var(--mep-border-strong);
    background: var(--mep-surface);
    margin-bottom: 12px;
  }
  .help-search input {
    border: 0;
    outline: 0;
    font-family: inherit;
    font-size: 12.5px;
    color: var(--mep-fg);
    background: transparent;
    width: 100%;
    min-width: 0;
  }
  .help-search input::placeholder { color: var(--mep-fg-4); }
  .help-search-clear { border: 0; background: transparent; padding: 0; cursor: pointer; display: flex; color: var(--mep-fg-3); }

  .help-content {
    flex: 1;
    min-width: 0;
    padding: 24px clamp(16px, 3vw, 30px) 48px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .help-head-title { margin: 0 0 3px; }
  .help-lede { max-width: 72ch; margin: 0; }
  .help-hint { font-size: 11.5px; color: var(--mep-fg-3); line-height: 1.45; margin: 0; }
  .help-prose { max-width: 72ch; line-height: 1.6; margin: 0; }

  .help-results { overflow: hidden; }
  .help-result {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 11px 18px;
    border: 0;
    border-bottom: 1px solid var(--mep-divider);
    background: transparent;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .help-result:last-child { border-bottom: none; }
  .help-result:hover { background: var(--mep-hover); }
  .help-result-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .help-empty { padding: 24px 18px; text-align: center; }

  .help-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
  }
  .help-step {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 16px 18px;
    border-bottom: 1px solid var(--mep-divider);
  }
  .help-step:last-child { border-bottom: none; }
  .help-step-num {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: var(--mep-r-pill);
    background: var(--mep-acc-soft);
    color: var(--mep-acc);
    font-size: 11.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .help-step-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

  .help-action { align-self: flex-start; height: 32px; font-size: 13px; padding: 0 10px; text-decoration: none; }

  .help-icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--mep-acc-soft);
    color: var(--mep-acc);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .help-icon-lg { width: 44px; height: 44px; border-radius: 12px; }

  .help-teaser {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 18px;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    text-decoration: none;
  }
  .help-teaser:hover { background: var(--mep-hover); }
  .help-teaser-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }

  .help-tour { display: flex; gap: 16px; align-items: flex-start; }
  .help-stops { display: grid; grid-template-columns: 1fr; gap: 6px 14px; }
  .help-stop { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--mep-fg-2); }
  .help-stop-num {
    width: 18px;
    height: 18px;
    border-radius: var(--mep-r-pill);
    background: var(--mep-hover);
    color: var(--mep-fg-3);
    font-size: 10.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .help-tips { display: grid; grid-template-columns: 1fr; gap: 14px; }
  .help-tip {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px;
    border: 1px solid var(--mep-divider);
    border-radius: var(--mep-r-card);
    background: var(--mep-surface-2);
    transition: background 150ms ease-out, border-color 150ms ease-out;
  }
  .help-tip:hover { background: var(--mep-surface); border-color: var(--mep-border); }
  .help-tip-body { flex: 1; font-size: 12.5px; }
  .help-tip-head { display: flex; align-items: center; gap: 8px; color: var(--mep-fg); }
  .help-tip-pro {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0 5px;
    border-radius: var(--mep-r-tag);
    background: var(--mep-hover);
    color: var(--mep-fg-2);
    border: 1px solid var(--mep-border);
  }

  .help-card, .help-faq { overflow: hidden; }
  .help-faq-item { border-bottom: 1px solid var(--mep-divider); }
  .help-faq-item:last-child { border-bottom: 0; }
  .help-faq-q {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 48px;
    padding: 13px 18px;
    cursor: pointer;
    list-style: none;
    color: var(--mep-fg);
  }
  .help-faq-q::-webkit-details-marker { display: none; }
  .help-faq-q:hover { color: var(--mep-acc); }
  .help-faq-chevron { display: inline-flex; color: var(--mep-fg-3); transition: transform 150ms ease; flex-shrink: 0; }
  .help-faq-item[open] .help-faq-chevron { transform: rotate(180deg); }
  .help-faq-a { padding: 0 18px 15px; }

  @media (min-width: 768px) {
    .help-steps { grid-template-columns: 1fr 1fr; }
    .help-step:nth-child(odd) { border-right: 1px solid var(--mep-divider); }
    .help-step:nth-last-child(-n + 2) { border-bottom: none; }
    .help-tips { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .help-stops { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  @media (max-width: 767px) {
    .help-shell { flex-direction: column; }
    .help-rail {
      width: 100%;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 8px;
      padding: 14px 14px 12px;
      border-right: 0;
      border-bottom: 1px solid var(--mep-divider);
      overflow-y: visible;
    }
    .help-search { width: 100%; height: 44px; margin-bottom: 4px; }
    .help-search input { font-size: 14px; }
    .help-rail-item {
      height: 40px;
      padding: 0 15px;
      border: 1px solid var(--mep-border);
      border-radius: var(--mep-r-pill);
      background: var(--mep-surface);
      font-weight: 500;
    }
    .help-rail-item.active { border-color: var(--mep-acc); background: var(--mep-acc); color: var(--mep-acc-fg); }
    .help-rail-spacer, .help-rail-foot { display: none; }
    .help-content { padding: 14px 14px 40px; }
    .help-action { min-height: 44px; }
    .help-faq-q { min-height: 56px; }
  }
</style>
