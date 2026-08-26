<script lang="ts">
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Wallet from '@lucide/svelte/icons/wallet';
  import Clock from '@lucide/svelte/icons/clock';
  import FileCheck from '@lucide/svelte/icons/file-check';
  import CalendarOff from '@lucide/svelte/icons/calendar-off';
  import Truck from '@lucide/svelte/icons/truck';
  import type { Severity, WorkItem } from '$lib/dashboard-turno';
  import { locale, t, ti, tiv } from '$lib/i18n';
  import { fmtEurCompact } from '$lib/formatters';

  let { item, primary = false }: { item: WorkItem; primary?: boolean } = $props();

  const ICON = {
    price: TrendingUp,
    budget: Wallet,
    due: Clock,
    review: FileCheck,
    missing: CalendarOff,
    supplier: Truck,
  };

  const TONE: Record<Severity, [string, string]> = {
    high: ['var(--mep-neg)',     'var(--mep-neg-soft)'],
    med:  ['var(--mep-warn)',    'var(--mep-warn-soft)'],
    low:  ['var(--mep-caution)', 'var(--mep-caution-soft)'],
  };

  function localiseDates(vars: Record<string, string | number>, loc: string): Record<string, string | number> {
    if (!('date' in vars)) return vars;
    const parsed = new Date(String(vars.date));
    if (Number.isNaN(parsed.getTime())) return vars;
    return { ...vars, date: parsed.toLocaleDateString(loc, { day: '2-digit', month: 'short' }) };
  }

  const titleVars = $derived(localiseDates(item.titleVars, $locale));
  const whyVars = $derived(localiseDates(item.whyVars, $locale));
  const Icon = $derived(ICON[item.kind]);
  const color = $derived(TONE[item.severity][0]);
  const soft = $derived(TONE[item.severity][1]);
</script>

<div
  class="card"
  style="padding:11px 16px;display:grid;grid-template-columns:34px 1fr auto;gap:14px;align-items:flex-start;
         border-color:{primary ? color : 'var(--mep-border)'};
         box-shadow:{primary ? `inset 3px 0 0 ${color}, var(--mep-shadow-card)` : 'var(--mep-shadow-card)'};"
>
  <div
    style="width:34px;height:34px;border-radius:var(--mep-r-input);background:{soft};color:{color};
           display:flex;align-items:center;justify-content:center;"
  >
    <Icon size={17} />
  </div>

  <div style="min-width:0;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
      <span class="label">{$t(`turno.kind.${item.kind}`)}</span>
      <span style="font-size:11px;color:var(--mep-fg-4);">·</span>
      <span style="font-size:11px;color:var(--mep-fg-3);">{$ti(item.urgencyKey, item.urgencyVars)}</span>
    </div>
    <div class="subtitle" style="line-height:1.3;text-wrap:pretty;">
      {$tiv(item.titleKey, titleVars)}
    </div>
    <div class="body" style="margin-top:2px;">
      {$tiv(item.whyKey, whyVars)}
    </div>
  </div>

  <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;gap:6px;flex-shrink:0;min-height:66px;">
    {#if item.eur > 0}
      <div style="text-align:right;">
        <div class="num" style="font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.02em;line-height:1.1;">
          {fmtEurCompact(item.eur)}
        </div>
        <div class="label">{$t('turno.atStakeUnit')}</div>
      </div>
    {/if}
    <a
      href={item.href}
      class={primary ? 'btn btn-primary' : 'btn btn-secondary'}
      style="height:28px;text-decoration:none;"
    >{$t(item.actionKey)}</a>
  </div>
</div>
