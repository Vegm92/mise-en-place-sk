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

  const reviewColor = $derived.by(() => {
    if (data.review.incidencias > 0) return 'var(--mep-neg)';
    if (data.review.count > 0) return 'var(--mep-caution)';
    return 'var(--mep-pos)';
  });

</script>

<div style="height: 100%; overflow: auto; padding-bottom: 24px;">
  <div style="padding: 14px 18px 24px; display: flex; flex-direction: column; gap: 14px;">

    <div style="font-size:13px;color:var(--mep-fg-3);">
      {t(greeting)} · {dateStr}
    </div>

    <div class="card" style="padding: 16px;">
      <div class="label" style="margin-bottom: 6px;">{t('turno.atStake')}</div>
      <div class="num" style="font-size: 32px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.025em; line-height: 1;">
        {stake > 0 ? fmtEur(stake, locale.current) : '—'}
      </div>
      <div class="body" style="margin-top: 6px;">
        {worklist.length > 0 ? ti('mdash.turno.stakeSub', { n: worklist.length, urgent: urgentCount }) : t('turno.worklist.subMoney.zero')}
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
      <div class="card" style="padding: 12px; display: flex; flex-direction: column; gap: 5px; min-width: 0;">
        <span class="label">{t('turno.ribbon.pace')}</span>
        <span class="num" style="font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; color: var(--mep-fg);">
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
        <span class="num" style="font-size: 11px; font-weight: 500; color: {hasBudget && paceDelta > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)'};">
          {hasBudget ? ti('turno.ribbon.paceNote', { delta: fmtEurSigned(paceDelta, locale.current), day: daysElapsed }) : momNote}
        </span>
      </div>
      <div class="card" style="padding: 12px; display: flex; flex-direction: column; gap: 5px; min-width: 0;">
        <span class="label">{t('turno.ribbon.forecast')}</span>
        <span class="num" style="font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; color: var(--mep-fg);">
          {fmtEurCompact(projectedEom, locale.current)}
        </span>
        <span class="num" style="font-size: 11px; font-weight: 500; color: {hasBudget && overrun > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)'};">
          {hasBudget ? ti('turno.ribbon.forecastNote', { delta: fmtEurSigned(overrun, locale.current) }) : t('turno.ribbon.forecastNoBudget')}
        </span>
      </div>
      <div class="card" style="grid-column: 1 / -1; padding: 12px; display: flex; flex-direction: column; gap: 5px; min-width: 0;">
        <span class="label">{t('turno.ribbon.review')}</span>
        <span class="num" style="font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; color: var(--mep-fg);">
          {fmtEurCompact(data.review.amount, locale.current)}
        </span>
        <span class="num" style="font-size: 11px; font-weight: 500; color: {reviewColor};">
          {data.review.incidencias > 0
            ? tp('turno.ribbon.issuesNote', data.review.incidencias)
            : tp('turno.ribbon.reviewNote', data.review.count)}
        </span>
      </div>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 2px;">
      <div style="min-width: 0;">
        <div class="subtitle">{t('turno.worklist.title')}</div>
        <div class="body" style="margin-top: 1px;">
          {tp(sortMode === 'money' ? 'turno.worklist.subMoney' : 'turno.worklist.subUrgency', worklist.length)}
        </div>
      </div>
      {#if worklist.length > 1}
        <button
          type="button"
          style="display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; font-size: 13px; font-weight: 500; color: var(--mep-acc); min-height: 44px; flex-shrink: 0;"
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
          <span class="num" style="font-size: 11px; font-weight: 500; color: {overrun > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)'};">
            {fmtEurSigned(overrun, locale.current)}
          </span>
        {/if}
      {/snippet}
      {#if !hasPaceData && data.invoices_outside_month > 0}
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div class="body">{tp('turno.rail.paceOutOfRange', data.invoices_outside_month)}</div>
          <a href="/invoices" style="font-size:11px;color:var(--mep-acc);text-decoration:none;">{t('turno.rail.paceOutOfRangeAction')}</a>
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
        <a href="/budgets" style="font-size: 13px; font-weight: 500; color: var(--mep-acc); text-decoration: none; min-height: 44px; display: inline-flex; align-items: center;">
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
                <span class="num" style="font-size: 11px; color: var(--mep-fg-3); flex-shrink: 0;">
                  {fmtEurCompact(cat.spent, locale.current)} <span style="color: var(--mep-fg-4);">/ {fmtEurCompact(cat.budget, locale.current)}</span>
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
              <div class="num" style="font-size: 11px; margin-top: 5px; color: {cat.overrun > 0 ? 'var(--mep-neg)' : 'var(--mep-fg-3)'};">
                {ti('turno.rail.catForecast', { amount: fmtEurCompact(cat.forecast, locale.current), delta: fmtEurSigned(cat.overrun, locale.current) })}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </RailBlock>

  </div>
</div>
