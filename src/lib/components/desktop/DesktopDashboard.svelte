<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
  import PeriodPicker from '$lib/components/mep/PeriodPicker.svelte';
  import Bullet from '$lib/components/mep/Bullet.svelte';
  import PaceChart from '$lib/components/mep/PaceChart.svelte';
  import StatusChip from '$lib/components/desktop/turno/StatusChip.svelte';
  import RailBlock from '$lib/components/desktop/turno/RailBlock.svelte';
  import WorkCard from '$lib/components/desktop/turno/WorkCard.svelte';
  import { categoryColor } from '$lib/colors';
  import { locale, t, ti, tp, tcat } from '$lib/i18n';
  import { fmtEurCompact, fmtEurSigned } from '$lib/formatters';
  import {
    buildWorklist, buildCategoryRisk, buildPaceCurve, planToDate, atStake, sortWorklist,
  } from '$lib/dashboard-turno';
  import type {
    TurnoInput, SortMode, PriceShockInput, UncategorizedInput, MissingInput,
  } from '$lib/dashboard-turno';

  export interface Mom { this_month: number; last_month: number; pct_change: number | null }
  export interface Projection { projected_eom: number; days_elapsed: number; days_in_month: number; elapsed_pct: number }

  export interface DashboardData {
    firstInvoice: boolean | null;
    mom: Mom;
    review: { count: number; amount: number; incidencias: number };
    spark_data: number[] | null;
    total_budget: number;
    budgets: Record<string, number>;
    category_spend_map: Record<string, number>;
    projection: Projection | null;
    is_current_month: boolean;
    uncategorized_suppliers: UncategorizedInput[];
    turno_price_shocks: PriceShockInput[];
    missing_invoices: MissingInput[];
    invoices_outside_month: number;
  }

  let {
    data,
    prevMonthUrl,
    nextMonthUrl,
    canGoForward,
    currentPeriod,
  }: {
    data: DashboardData;
    prevMonthUrl: string;
    nextMonthUrl: string;
    canGoForward: boolean;
    currentPeriod: string;
  } = $props();

  let firstInvoiceDismissed = $state(false);
  let sortMode = $state<SortMode>('money');

  const daysInMonth = $derived(data.projection?.days_in_month ?? 30);
  const daysElapsed = $derived(data.projection?.days_elapsed ?? daysInMonth);

  const turnoInput = $derived<TurnoInput>({
    isCurrentMonth: data.is_current_month,
    daysElapsed,
    daysInMonth,
    monthSpend: data.mom.this_month,
    projectedEom: data.projection?.projected_eom ?? data.mom.this_month,
    totalBudget: data.total_budget,
    budgets: data.budgets,
    categorySpend: data.category_spend_map,
    priceShocks: data.turno_price_shocks,
    review: data.review,
    missing: data.missing_invoices,
    uncategorized: data.uncategorized_suppliers,
  });

  const worklist = $derived(buildWorklist(turnoInput));
  const sortedWorklist = $derived(sortWorklist(worklist, sortMode));
  const stake = $derived(atStake(worklist));

  const hasBudget = $derived(data.total_budget > 0);
  const planMtd = $derived(planToDate(data.total_budget, turnoInput));
  const paceDelta = $derived(data.mom.this_month - planMtd);
  const projectedEom = $derived(data.projection?.projected_eom ?? data.mom.this_month);
  const overrun = $derived(projectedEom - data.total_budget);

  const categoryRisk = $derived(buildCategoryRisk(turnoInput).slice(0, 3));
  const paceCurve = $derived(buildPaceCurve(data.spark_data ?? [], turnoInput));

  const momNote = $derived.by(() => {
    const pct = data.mom.pct_change;
    if (pct == null) return $t('turno.ribbon.paceNoData');
    return $ti('turno.ribbon.paceNoBudget', { delta: (pct >= 0 ? '+' : '') + pct + '%' });
  });

  const hasPaceData = $derived(data.mom.this_month > 0 || hasBudget);

  const reviewTone = $derived.by(() => {
    if (data.review.incidencias > 0) return 'neg';
    if (data.review.count > 0) return 'caution';
    return 'pos';
  });
</script>

<div class="hidden md:flex flex-col gap-3 p-4" style="min-height:0;">

  <div style="display:flex;align-items:center;gap:10px;">
    <PeriodPicker prevUrl={prevMonthUrl} nextUrl={nextMonthUrl} canGoForward={canGoForward} label={currentPeriod} />
  </div>

  {#if data.firstInvoice && !firstInvoiceDismissed}
    <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:var(--mep-r-card);background:var(--mep-pos-soft);border-left:3px solid var(--mep-pos);">
      <span style="font-size:18px;flex-shrink:0;line-height:1.2;">🎉</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--mep-pos);margin-bottom:2px;">{$t('ddash.firstInvoiceTitle')}</div>
        <div class="body">{$t('ddash.firstInvoiceBody')}</div>
      </div>
      <button
        style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--mep-fg-3);padding:2px;"
        onclick={() => firstInvoiceDismissed = true}
        aria-label={$t('ddash.close')}
      ><X size={13} /></button>
    </div>
  {/if}

  <div class="card" style="padding:10px 18px;display:flex;align-items:center;gap:20px;flex-shrink:0;flex-wrap:wrap;" data-coach="dashboard-main">
    <StatusChip
      label={$t('turno.ribbon.pace')}
      value={fmtEurCompact(data.mom.this_month, $locale)}
      tone={hasBudget && paceDelta > 0 ? 'neg' : 'pos'}
      note={hasBudget ? $ti('turno.ribbon.paceNote', { delta: fmtEurSigned(paceDelta, $locale), day: daysElapsed }) : momNote}
      wide={hasBudget}
    >
      {#snippet chart()}
        {#if hasBudget}
          <Bullet
            value={data.mom.this_month}
            target={planMtd}
            max={data.total_budget}
            width={90}
            height={11}
            label={$ti('turno.ribbon.paceAria', { spent: fmtEurCompact(data.mom.this_month, $locale), plan: fmtEurCompact(planMtd, $locale), budget: fmtEurCompact(data.total_budget, $locale) })}
          />
        {/if}
      {/snippet}
    </StatusChip>

    <StatusChip
      label={$t('turno.ribbon.forecast')}
      value={fmtEurCompact(projectedEom, $locale)}
      tone={hasBudget && overrun > 0 ? 'neg' : 'pos'}
      note={hasBudget ? $ti('turno.ribbon.forecastNote', { delta: fmtEurSigned(overrun, $locale) }) : $t('turno.ribbon.forecastNoBudget')}
    />

    <StatusChip
      label={$t('turno.ribbon.review')}
      value={fmtEurCompact(data.review.amount, $locale)}
      tone={reviewTone}
      note={data.review.incidencias > 0
        ? $tp('turno.ribbon.issuesNote', data.review.incidencias)
        : $tp('turno.ribbon.reviewNote', data.review.count)}
      last
    />

    <div style="flex:1;min-width:12px;"></div>

    <div style="text-align:right;">
      <div class="label">{$t('turno.atStake')}</div>
      <div class="num title-lg" style="line-height:1.15;">
        {fmtEurCompact(stake, $locale)}
      </div>
    </div>
  </div>

  <div class="grid gap-3 max-[1200px]:grid-cols-1" style="grid-template-columns:1fr 372px;align-items:start;">

    <div style="display:flex;flex-direction:column;gap:8px;min-width:0;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;padding:0 2px;">
        <div>
          <span class="subtitle">{$t('turno.worklist.title')}</span>
          <span class="body" style="margin-left:8px;">
            {$tp(sortMode === 'money' ? 'turno.worklist.subMoney' : 'turno.worklist.subUrgency', worklist.length)}
          </span>
          {#if !data.is_current_month && worklist.length > 0}
            <span style="font-size:11px;color:var(--mep-fg-4);margin-left:8px;">{$t('turno.worklist.always')}</span>
          {/if}
        </div>
        {#if worklist.length > 1}
          <button
            class="btn btn-ghost"
            style="height:26px;"
            onclick={() => sortMode = sortMode === 'money' ? 'urgency' : 'money'}
          >
            {$t(sortMode === 'money' ? 'turno.sort.toUrgency' : 'turno.sort.toMoney')}
            <ArrowUpDown size={12} />
          </button>
        {/if}
      </div>

      {#if sortedWorklist.length === 0}
        <div class="card" style="padding:28px 20px;text-align:center;">
          <div class="subtitle" style="margin-bottom:6px;">{$t('turno.empty.title')}</div>
          <div class="body" style="max-width:44ch;margin:0 auto 14px;">{$t('turno.empty.body')}</div>
          <a href="/" class="btn btn-primary" style="height:30px;text-decoration:none;">{$t('turno.empty.action')}</a>
        </div>
      {:else}
        {#each sortedWorklist as item, i (item.id)}
          <WorkCard {item} primary={i === 0} />
        {/each}
      {/if}
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;min-width:0;">

      <RailBlock title={$t('turno.rail.pace')}>
        {#snippet headerRight()}
          {#if hasBudget}
            <span class="num" style="font-size:11px;font-weight:500;color:{overrun > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)'};">
              {fmtEurSigned(overrun, $locale)}
            </span>
          {/if}
        {/snippet}
        {#if !hasPaceData && data.invoices_outside_month > 0}
          <div style="display:flex;flex-direction:column;gap:6px;">
            <div class="body">{$tp('turno.rail.paceOutOfRange', data.invoices_outside_month)}</div>
            <a href="/invoices" style="font-size:11px;color:var(--mep-acc);text-decoration:none;">{$t('turno.rail.paceOutOfRangeAction')}</a>
          </div>
        {:else if !hasPaceData}
          <div class="body">{$t('turno.rail.paceEmpty')}</div>
        {:else}
        <PaceChart
          points={paceCurve}
          budget={data.total_budget}
          todayDay={data.is_current_month ? Math.min(daysElapsed, daysInMonth) : daysInMonth}
          budgetLabel={$ti('turno.rail.budgetLine', { amount: fmtEurCompact(data.total_budget, $locale) })}
          forecastLabel={$t('turno.rail.forecastLabel')}
          forecastValueLabel={fmtEurCompact(projectedEom, $locale)}
          ariaLabel={$t('turno.rail.paceAriaChart')}
        />
        {/if}
      </RailBlock>

      <RailBlock title={$t('turno.rail.cats')}>
        {#snippet headerRight()}
          <a href="/budgets" class="btn btn-ghost" style="height:22px;font-size:11px;padding:0 6px;text-decoration:none;">
            {$t('turno.rail.catsAll')}
          </a>
        {/snippet}
        {#if categoryRisk.length === 0}
          <div class="body">
            {$t('turno.rail.catsEmpty')}
          </div>
        {:else}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each categoryRisk as cat (cat.category)}
              <div>
                <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px;gap:8px;">
                  <span class="body-strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{$tcat(cat.category)}</span>
                  <span class="num" style="font-size:11px;color:var(--mep-fg-3);flex-shrink:0;">
                    {fmtEurCompact(cat.spent, $locale)} <span style="color:var(--mep-fg-4);">/ {fmtEurCompact(cat.budget, $locale)}</span>
                  </span>
                </div>
                <Bullet
                  value={cat.spent}
                  target={cat.planToDate}
                  max={cat.budget * 1.05}
                  color={categoryColor(cat.category)}
                  width={344}
                  height={11}
                  label={$ti('turno.rail.catBullet', { category: $tcat(cat.category), spent: fmtEurCompact(cat.spent, $locale), budget: fmtEurCompact(cat.budget, $locale) })}
                />
                <div class="num" style="font-size:11px;margin-top:4px;color:{cat.overrun > 0 ? 'var(--mep-neg)' : 'var(--mep-fg-3)'};">
                  {$ti('turno.rail.catForecast', { amount: fmtEurCompact(cat.forecast, $locale), delta: fmtEurSigned(cat.overrun, $locale) })}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </RailBlock>

    </div>
  </div>
</div>
