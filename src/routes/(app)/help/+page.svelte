<script lang="ts">
  import { goto } from '$app/navigation';
  import { t, ti } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import { HELP_STEPS, HELP_TIPS, HELP_FAQ } from '$lib/help-content';
  import { setTutorialStep } from '$lib/stores/tutorial';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Compass from '@lucide/svelte/icons/compass';
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
</script>

<div class="flex flex-col gap-4 p-4 md:p-6" data-coach="help-main">

  <p class="body help-lede">{$t('help.intro')}</p>

  <SectionCard title={$t('help.start.title')} sub={$t('help.start.sub')}>
    <ol class="help-steps">
      {#each HELP_STEPS as step, i (step.key)}
        <li class="help-step">
          <span class="help-step-num num" aria-label={$ti('help.step', { n: i + 1 })}>{i + 1}</span>
          <div class="help-step-body">
            <div class="body-strong">{$t(`help.start.${step.key}.title`)}</div>
            <p class="body help-prose">{$t(`help.start.${step.key}.body`)}</p>
            {#if step.href && step.actionKey}
              <a href={step.href} class="btn btn-ghost help-action">
                {$t(step.actionKey)} <ArrowRight size={12} />
              </a>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </SectionCard>

  <SectionCard title={$t('help.tour.title')}>
    <div class="help-tour">
      <Compass size={18} class="help-tour-icon" />
      <div class="help-step-body">
        <p class="body help-prose">{$t('help.tour.body')}</p>
        <button type="button" class="btn btn-secondary help-action" onclick={startTour} disabled={startingTour}>
          {$t('help.tour.btn')} <ArrowRight size={12} />
        </button>
      </div>
    </div>
  </SectionCard>

  <SectionCard title={$t('help.tips.title')} sub={$t('help.tips.sub')}>
    <div class="help-tips">
      {#each HELP_TIPS as tip (tip.key)}
        {@const Icon = TIP_ICONS[tip.key]}
        <div class="help-tip">
          <div class="help-tip-head">
            <Icon size={15} />
            <span class="body-strong">{$t(`help.tip.${tip.key}.title`)}</span>
            {#if tip.pro}<span class="help-tip-pro">{$t('nav.badge.pro')}</span>{/if}
          </div>
          <p class="body help-prose">{$t(`help.tip.${tip.key}.body`)}</p>
          <a href={tip.href} class="btn btn-ghost help-action">
            {$t(`help.tip.${tip.key}.action`)} <ArrowRight size={12} />
          </a>
        </div>
      {/each}
    </div>
  </SectionCard>

  <SectionCard title={$t('help.faq.title')}>
    <div class="help-faq">
      {#each HELP_FAQ as item (item)}
        <details class="help-faq-item">
          <summary class="help-faq-q">
            <span class="body-strong">{$t(`help.faq.${item}.q`)}</span>
            <ChevronDown size={14} class="help-faq-chevron" />
          </summary>
          <p class="body help-prose">{$t(`help.faq.${item}.a`)}</p>
        </details>
      {/each}
    </div>
  </SectionCard>

  <SectionCard title={$t('help.more.title')}>
    <div class="help-step-body">
      <p class="body help-prose">{$t('help.more.body')}</p>
      <a href="/settings" class="btn btn-ghost help-action">
        <Settings size={13} /> {$t('help.more.settings')}
      </a>
    </div>
  </SectionCard>

</div>

<style>
  .help-lede { max-width: 72ch; }

  .help-prose { max-width: 72ch; line-height: 1.6; margin: 0; }

  .help-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .help-step { display: flex; gap: 12px; align-items: flex-start; }

  .help-step-num {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: var(--mep-r-pill);
    background: var(--mep-acc-soft);
    color: var(--mep-acc);
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .help-step-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

  .help-action {
    align-self: flex-start;
    height: 28px;
    font-size: 13px;
    padding: 0 8px;
    text-decoration: none;
  }

  .help-tour { display: flex; gap: 12px; align-items: flex-start; }

  .help-tour :global(.help-tour-icon) { color: var(--mep-acc); flex-shrink: 0; margin-top: 2px; }

  .help-tips {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }

  @media (min-width: 768px) {
    .help-tips { grid-template-columns: 1fr 1fr; }
  }

  .help-tip {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px;
    border: 1px solid var(--mep-divider);
    border-radius: var(--mep-r-card);
    background: var(--mep-surface-2);
  }

  .help-tip-head { display: flex; align-items: center; gap: 8px; color: var(--mep-fg); }

  .help-tip-pro {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: var(--mep-r-tag);
    background: var(--mep-acc);
    color: var(--mep-acc-fg);
  }

  .help-faq { display: flex; flex-direction: column; }

  .help-faq-item { border-bottom: 1px solid var(--mep-divider); }
  .help-faq-item:last-child { border-bottom: 0; }

  .help-faq-q {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    cursor: pointer;
    list-style: none;
    color: var(--mep-fg);
  }

  .help-faq-q::-webkit-details-marker { display: none; }

  .help-faq-q:hover { color: var(--mep-acc); }

  .help-faq-q :global(.help-faq-chevron) {
    flex-shrink: 0;
    color: var(--mep-fg-3);
    transition: transform 150ms ease;
  }

  .help-faq-item[open] .help-faq-q :global(.help-faq-chevron) { transform: rotate(180deg); }

  .help-faq-item > .help-prose { padding: 0 0 14px; }
</style>
