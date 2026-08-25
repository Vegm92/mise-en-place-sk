<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import { REPORT_TYPES } from '$lib/reports';
  import X from '@lucide/svelte/icons/x';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import PieChart from '@lucide/svelte/icons/pie-chart';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Wallet from '@lucide/svelte/icons/wallet';

  let { data }: { data: PageData } = $props();

  const ICONS = {
    weekly: CalendarDays,
    monthly: PieChart,
    prices: TrendingUp,
    payables: Wallet,
  };
</script>

<div style="max-width:680px;margin:0 auto;padding:32px 24px;display:flex;flex-direction:column;gap:24px;">

  <div style="display:flex;align-items:center;gap:10px;">
    <Newspaper size={18} style="color:var(--mep-acc);flex-shrink:0;" />
    <div>
      <h1 style="font-size:16px;font-weight:600;margin:0;line-height:1.2;">{$t('digest.title')}</h1>
      <p style="font-size:12px;color:var(--mep-fg-3);margin:2px 0 0;">{$t('digest.week')} {data.current_week}</p>
    </div>
  </div>

  {#if data.weekly_digest}
    <div style="padding:20px 22px;border-radius:10px;background:var(--mep-surface);border:1px solid var(--mep-border);border-left:3px solid var(--mep-acc);position:relative;" data-coach="digest-main">
      {#if !data.weekly_digest.dismissed}
        <form method="POST" action="?/dismissDigest" style="position:absolute;top:12px;right:12px;">
          <button type="submit" style="background:none;border:none;cursor:pointer;color:var(--mep-fg-3);padding:4px;line-height:1;" aria-label={$t('a11y.close')}>
            <X size={13} />
          </button>
        </form>
      {/if}
      <p style="font-size:14px;color:var(--mep-fg);line-height:1.65;white-space:pre-wrap;margin:0;">
        {data.weekly_digest.text}
      </p>
      {#if data.weekly_digest.dismissed}
        <p style="margin-top:12px;font-size:12px;color:var(--mep-fg-3);">{$t('digest.dismissed')}</p>
      {/if}
    </div>
  {:else}
    <div style="padding:24px;border-radius:10px;background:var(--mep-surface);border:1px solid var(--mep-border);text-align:center;" data-coach="digest-main">
      <p style="font-size:13px;color:var(--mep-fg-3);margin:0;">{$t('digest.unavailable')}</p>
    </div>
  {/if}

  <div style="display:flex;flex-direction:column;gap:10px;">
    <div>
      <h2 style="font-size:13px;font-weight:600;margin:0;">{$t('rep.section.type')}</h2>
      <p style="font-size:11px;color:var(--mep-fg-3);margin:2px 0 0;">{$t('rep.section.typeHint')}</p>
    </div>

    {#each REPORT_TYPES as type (type)}
      {@const Icon = ICONS[type]}
      <a href="/reports/{type}" class="rep-card">
        <Icon size={18} style="color:var(--mep-acc);flex-shrink:0;" />
        <span style="display:flex;flex-direction:column;gap:2px;min-width:0;">
          <span class="rep-card-title">{$t(`rep.${type}.name`)}</span>
          <span class="rep-card-desc">{$t(`rep.${type}.desc`)}</span>
        </span>
        <ChevronRight size={16} style="color:var(--mep-fg-3);flex-shrink:0;margin-left:auto;" />
      </a>
    {/each}
  </div>

</div>

<style>
  .rep-card {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; border-radius: 10px;
    background: var(--mep-surface); border: 1px solid var(--mep-border);
    text-decoration: none; color: var(--mep-fg);
  }
  .rep-card:hover { border-color: var(--mep-acc); }
  .rep-card-title { font-size: 14px; font-weight: 600; }
  .rep-card-desc { font-size: 12px; color: var(--mep-fg-3); line-height: 1.45; }
</style>
