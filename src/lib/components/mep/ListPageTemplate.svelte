<script lang="ts">
  import type { Snippet } from 'svelte';
  import PeriodPills from './PeriodPills.svelte';
  import KpiCard from './KpiCard.svelte';
  import TrendLineChart from './TrendLineChart.svelte';
  import Search from '@lucide/svelte/icons/search';
  import LayoutList from '@lucide/svelte/icons/layout-list';
  import LineChart from '@lucide/svelte/icons/line-chart';

  type Variant = 'default' | 'neg' | 'pos' | 'warn';
  type Pill = { value: string; label: string; href: string };
  type View = 'list' | 'chart';

  interface KpiConfig {
    key: string;
    label: string;
    value: string | number;
    sub?: string;
    variant?: Variant;
    delta?: number;
    deltaCtx?: string;
    spark?: number[];
    onClick?: () => void;
  }

  interface TrendBadge { key: string; label: string; color: string; active: boolean }
  interface TrendSeries { key: string; label: string; color: string; values: number[] }

  let {
    dataCoach,
    search = $bindable(''),
    searchPlaceholder = '',
    period,
    periodPills,
    kpis = [],
    view = $bindable<View>('list'),
    viewLabels,
    trendTitle = '',
    trendBadges = [],
    onToggleTrendBadge,
    trendXLabels = [],
    trendSeries = [],
    trendValueFormatter = (v: number) => String(v),
    trendEmptyLabel,
    filters,
    table,
  }: {
    dataCoach?: string;
    search?: string;
    searchPlaceholder?: string;
    period: string;
    periodPills: Pill[];
    kpis?: KpiConfig[];
    view?: View;
    viewLabels: { list: string; chart: string };
    trendTitle?: string;
    trendBadges?: TrendBadge[];
    onToggleTrendBadge?: (key: string) => void;
    trendXLabels?: string[];
    trendSeries?: TrendSeries[];
    trendValueFormatter?: (v: number) => string;
    trendEmptyLabel: string;
    filters?: Snippet;
    table: Snippet;
  } = $props();
</script>

<div class="flex flex-col gap-4" data-coach={dataCoach}>

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <div class="search-field">
      <span class="search-icon"><Search size={14} /></span>
      <input class="input" placeholder={searchPlaceholder} bind:value={search} />
    </div>
    <PeriodPills active={period} pills={periodPills} />
  </div>

  {#if kpis.length}
    <div class="grid gap-3 flex-shrink-0" style="grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));">
      {#each kpis as kpi (kpi.key)}
        {#if kpi.onClick}
          <button type="button" onclick={kpi.onClick} style="text-align:left;border:none;background:none;padding:0;cursor:pointer;">
            <KpiCard label={kpi.label} value={kpi.value} sub={kpi.sub} variant={kpi.variant} delta={kpi.delta} deltaCtx={kpi.deltaCtx} spark={kpi.spark} />
          </button>
        {:else}
          <KpiCard label={kpi.label} value={kpi.value} sub={kpi.sub} variant={kpi.variant} delta={kpi.delta} deltaCtx={kpi.deltaCtx} spark={kpi.spark} />
        {/if}
      {/each}
    </div>
  {/if}

  <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap;">
    <div class="period-track" role="group" style="flex-shrink:0;">
      <button type="button" class="period-pill {view === 'list' ? 'active' : ''}" title={viewLabels.list} aria-label={viewLabels.list} style="padding:7px 9px;" onclick={() => (view = 'list')}>
        <LayoutList size={14} />
      </button>
      <button type="button" class="period-pill {view === 'chart' ? 'active' : ''}" title={viewLabels.chart} aria-label={viewLabels.chart} style="padding:7px 9px;" onclick={() => (view = 'chart')}>
        <LineChart size={14} />
      </button>
    </div>
    {#if filters}{@render filters()}{/if}
  </div>

  {#if view === 'chart'}
    <div class="card" style="padding:16px;">
      {#if trendTitle}<div class="subtitle" style="margin-bottom:12px;">{trendTitle}</div>{/if}
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
        {#each trendBadges as b (b.key)}
          <button type="button" onclick={() => onToggleTrendBadge?.(b.key)} class="badge" style="
              cursor:pointer;border:1px solid {b.active ? b.color : 'var(--mep-border)'};
              background:{b.active ? `color-mix(in oklab, ${b.color} 12%, transparent)` : 'transparent'};
              color:{b.active ? b.color : 'var(--mep-fg-3)'};
            ">
            {b.label}
          </button>
        {/each}
        {#if !trendBadges.length}<span class="body" style="font-size:12px;color:var(--mep-fg-3);">{trendEmptyLabel}</span>{/if}
      </div>
      <TrendLineChart xLabels={trendXLabels} series={trendSeries} valueFormatter={trendValueFormatter} emptyLabel={trendEmptyLabel} />
    </div>
  {:else}
    <div class="card" style="padding:0;overflow:hidden;">
      {@render table()}
    </div>
  {/if}
</div>
