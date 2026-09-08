<script lang="ts">
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
  import Bullet from '$lib/components/mep/Bullet.svelte';
  import PaceChart from '$lib/components/mep/PaceChart.svelte';
  import RailBlock from '$lib/components/desktop/turno/RailBlock.svelte';
  import WorkCardMobile from '$lib/components/mobile/turno/WorkCardMobile.svelte';
  import { categoryColor } from '$lib/colors';
  import { locale, t, ti, tp, tcat } from '$lib/i18n';
  import { fmtEur, fmtEurCompact, fmtEurSigned } from '$lib/formatters';
  import {
    buildWorklist, buildCategoryRisk, buildPaceCurve, planToDate, atStake, sortWorklist,
  } from '$lib/dashboard-turno';
  import type { TurnoInput, SortMode } from '$lib/dashboard-turno';
  import type { DashboardData } from '$lib/components/desktop/DesktopDashboard.svelte';

  let { data }: { data: DashboardData } = $props();

  let sortMode = $state<SortMode>('money');

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    if (h < 13) return 'mdash.morning';
    if (h < 21) return 'mdash.afternoon';
    return 'mdash.evening';
  });
  const dateStr = $derived(
    new Date().toLocaleDateString(locale.current, { weekday: 'long', day: 'numeric', month: 'long' })
  );

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
  const urgentCount = $derived(worklist.filter((i) => i.severity === 'high').length);

  const hasBudget = $derived(data.total_budget > 0);
  const planMtd = $derived(planToDate(data.total_budget, turnoInput));
  const paceDelta = $derived(data.mom.this_month - planMtd);
  const projectedEom = $derived(data.projection?.projected_eom ?? data.mom.this_month);
  const overrun = $derived(projectedEom - data.total_budget);

  const categoryRisk = $derived(buildCategoryRisk(turnoInput).slice(0, 3));
  const paceCurve = $derived(buildPaceCurve(data.spark_data ?? [], turnoInput));
  const hasPaceData = $derived(data.mom.this_month > 0 || hasBudget);

  const momNote = $derived.by(() => {
    const pct = data.mom.pct_change;
    if (pct == null) return t('turno.ribbon.paceNoData');
    return ti('turno.ribbon.paceNoBudget', { delta: (pct >= 0 ? '+' : '') + pct + '%' });
  });

  const reviewNeg     = $derived(data.review.incidencias > 0);
  const reviewCaution = $derived(!reviewNeg && data.review.count > 0);

</script>

<div class="h-full overflow-auto pb-6">
  <div class="px-[18px] pt-[14px] pb-6 flex flex-col gap-[14px]">

    <div class="text-[13px] text-fg-3">
      {t(greeting)} · {dateStr}
    </div>

    <div class="card p-4">
      <div class="label mb-1.5">{t('turno.atStake')}</div>
      <div class="num text-[32px] font-semibold text-fg tracking-[-0.025em] leading-none">
        {stake > 0 ? fmtEur(stake, locale.current) : '—'}
      </div>
      <div class="body mt-1.5">
        {worklist.length > 0 ? ti('mdash.turno.stakeSub', { n: worklist.length, urgent: urgentCount }) : t('turno.worklist.subMoney.zero')}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-[10px]">
      <div class="card p-3 flex flex-col gap-[5px] min-w-0">
        <span class="label">{t('turno.ribbon.pace')}</span>
        <span class="num text-[20px] font-semibold tracking-[-0.02em] leading-[1.1] text-fg">
          {fmtEurCompact(data.mom.this_month, locale.current)}
        </span>
        {#if hasBudget}
          <Bullet
            value={data.mom.this_month}
            target={planMtd}
            max={data.total_budget}
            width={140}
            height={10}
            label={ti('turno.ribbon.paceAria', { spent: fmtEurCompact(data.mom.this_month, locale.current), plan: fmtEurCompact(planMtd, locale.current), budget: fmtEurCompact(data.total_budget, locale.current) })}
          />
        {/if}
        <span class="num text-[11px] font-medium"
          class:text-neg={hasBudget && paceDelta > 0} class:text-pos={!(hasBudget && paceDelta > 0)}>
          {hasBudget ? ti('turno.ribbon.paceNote', { delta: fmtEurSigned(paceDelta, locale.current), day: daysElapsed }) : momNote}
        </span>
      </div>
      <div class="card p-3 flex flex-col gap-[5px] min-w-0">
        <span class="label">{t('turno.ribbon.forecast')}</span>
        <span class="num text-[20px] font-semibold tracking-[-0.02em] leading-[1.1] text-fg">
          {fmtEurCompact(projectedEom, locale.current)}
        </span>
        <span class="num text-[11px] font-medium"
          class:text-neg={hasBudget && overrun > 0} class:text-pos={!(hasBudget && overrun > 0)}>
          {hasBudget ? ti('turno.ribbon.forecastNote', { delta: fmtEurSigned(overrun, locale.current) }) : t('turno.ribbon.forecastNoBudget')}
        </span>
      </div>
      <div class="card col-span-2 p-3 flex flex-col gap-[5px] min-w-0">
        <span class="label">{t('turno.ribbon.review')}</span>
        <span class="num text-[20px] font-semibold tracking-[-0.02em] leading-[1.1] text-fg">
          {fmtEurCompact(data.review.amount, locale.current)}
        </span>
        <span class="num text-[11px] font-medium"
          class:text-neg={reviewNeg} class:text-caution={reviewCaution} class:text-pos={!reviewNeg && !reviewCaution}>
          {data.review.incidencias > 0
            ? tp('turno.ribbon.issuesNote', data.review.incidencias)
            : tp('turno.ribbon.reviewNote', data.review.count)}
        </span>
      </div>
    </div>

    <div class="flex items-center justify-between gap-2 pt-0.5">
      <div class="min-w-0">
        <div class="subtitle">{t('turno.worklist.title')}</div>
        <div class="body mt-px">
          {tp(sortMode === 'money' ? 'turno.worklist.subMoney' : 'turno.worklist.subUrgency', worklist.length)}
        </div>
      </div>
      {#if worklist.length > 1}
        <button
          type="button"
          class="inline-flex items-center gap-1.5 bg-transparent border-0 text-[13px] font-medium text-acc min-h-[44px] shrink-0 cursor-pointer"
          onclick={() => sortMode = sortMode === 'money' ? 'urgency' : 'money'}
        >
          {t(sortMode === 'money' ? 'turno.sort.toUrgency' : 'turno.sort.toMoney')}
          <ArrowUpDown size={14} />
        </button>
      {/if}
    </div>

    {#if sortedWorklist.length === 0}
      <div class="card" style="padding: 24px 18px; text-align: center;">
        <div class="subtitle" style="margin-bottom: 6px;">{t('turno.empty.title')}</div>
        <div class="body" style="margin: 0 0 14px;">{t('turno.empty.body')}</div>
        <a href="/" class="btn btn-primary" style="text-decoration: none;">{t('turno.empty.action')}</a>
      </div>
    {:else}
      <div style="display: flex; flex-direction: column; gap: 10px;">
        {#each sortedWorklist as item, i (item.id)}
          <WorkCardMobile {item} primary={i === 0} />
        {/each}
      </div>
    {/if}

    <RailBlock title={t('turno.rail.pace')}>
      {#snippet headerRight()}
        {#if hasBudget}
          <span class="num text-[11px] font-medium" class:text-neg={overrun > 0} class:text-pos={overrun <= 0}>
            {fmtEurSigned(overrun, locale.current)}
          </span>
        {/if}
      {/snippet}
      {#if !hasPaceData && data.invoices_outside_month > 0}
        <div class="flex flex-col gap-1.5">
          <div class="body">{tp('turno.rail.paceOutOfRange', data.invoices_outside_month)}</div>
          <a href="/invoices" class="text-[11px] text-acc no-underline">{t('turno.rail.paceOutOfRangeAction')}</a>
        </div>
      {:else if !hasPaceData}
        <div class="body">{t('turno.rail.paceEmpty')}</div>
      {:else}
        <PaceChart
          points={paceCurve}
          budget={data.total_budget}
          todayDay={data.is_current_month ? Math.min(daysElapsed, daysInMonth) : daysInMonth}
          budgetLabel={ti('turno.rail.budgetLine', { amount: fmtEurCompact(data.total_budget, locale.current) })}
          forecastLabel={t('turno.rail.forecastLabel')}
          forecastValueLabel={fmtEurCompact(projectedEom, locale.current)}
          ariaLabel={t('turno.rail.paceAriaChart')}
          width={326}
          height={130}
        />
      {/if}
    </RailBlock>

    <RailBlock title={t('turno.rail.cats')}>
      {#snippet headerRight()}
        <a href="/budgets" class="text-[13px] font-medium text-acc no-underline min-h-[44px] inline-flex items-center">
          {t('turno.rail.catsAll')}
        </a>
      {/snippet}
      {#if categoryRisk.length === 0}
        <div class="body">{t('turno.rail.catsEmpty')}</div>
      {:else}
        <div style="display: flex; flex-direction: column; gap: 12px;">
          {#each categoryRisk as cat (cat.category)}
            <div>
              <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 5px;">
                <span class="body-strong" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{tcat(cat.category)}</span>
                <span class="num text-[11px] text-fg-3 shrink-0">
                  {fmtEurCompact(cat.spent, locale.current)} <span class="text-fg-4">/ {fmtEurCompact(cat.budget, locale.current)}</span>
                </span>
              </div>
              <Bullet
                value={cat.spent}
                target={cat.planToDate}
                max={cat.budget * 1.05}
                color={categoryColor(cat.category)}
                width={326}
                height={10}
                label={ti('turno.rail.catBullet', { category: tcat(cat.category), spent: fmtEurCompact(cat.spent, locale.current), budget: fmtEurCompact(cat.budget, locale.current) })}
              />
              <div class="num text-[11px] mt-[5px]" class:text-neg={cat.overrun > 0} class:text-fg-3={cat.overrun <= 0}>
                {ti('turno.rail.catForecast', { amount: fmtEurCompact(cat.forecast, locale.current), delta: fmtEurSigned(cat.overrun, locale.current) })}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </RailBlock>

  </div>
</div>
