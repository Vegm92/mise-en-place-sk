<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { locale, t, ti } from '$lib/i18n';
  import { fmtEur, fmtEurCompact } from '$lib/formatters';
  import {
    COHORT_OFFSETS,
    HEALTHY_LTV_CAC_RATIO,
    churnHealth,
    paybackHealth,
    ratioHealth,
    retentionHealth,
    type Health,
  } from '$lib/revenue-math';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminKpiCard from '$lib/components/admin/AdminKpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import InfoTooltip from '$lib/components/mep/InfoTooltip.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const HEALTH_COLOR: Record<Health, string> = {
    good:    'var(--mep-pos)',
    warn:    'var(--mep-warn)',
    bad:     'var(--mep-neg)',
    unknown: 'var(--mep-fg-3)',
  };

  const SEVERITY_CLASS: Record<string, string> = {
    info:  'text-fg-3',
    warn:  'text-warn',
    error: 'text-neg',
  };

  const o = $derived(data.overview);

  function eur(cents: number): string {
    return fmtEurCompact((cents / 100) || 0, $locale);
  }

  function eur2(cents: number): string {
    return fmtEur(cents / 100, $locale);
  }

  function pct(value: number | null): string {
    return value === null ? '—' : (value * 100).toFixed(1) + '%';
  }

  function num(value: number | null, digits = 1): string {
    return value === null ? '—' : value.toFixed(digits);
  }

  function months(value: number | null): string {
    return value === null ? '—' : value.toFixed(1);
  }
</script>

<AdminPageHead route="/admin/revenue" title={$t('admin.rev.title')}>
  {#snippet right()}
    <div class="text-right">
      <div class="num text-xs text-fg-3">{o.month}</div>
      <div class="num text-[11.5px] text-fg-4 mt-0.5">
        {o.lastCapturedAt
          ? $ti('admin.rev.lastCapture', { time: new Date(o.lastCapturedAt).toLocaleString('en-GB') })
          : $t('admin.rev.never')}
      </div>
    </div>
  {/snippet}
</AdminPageHead>

<div class="px-3 md:px-6 pb-6 flex flex-col gap-3.5">

  {#if form && 'error' in form && typeof form.error === 'string'}
    <div class="card py-2.5 px-3.5 border-neg text-neg text-[13px]">{$t(form.error)}</div>
  {/if}

  <div class="card py-3.5 px-4 flex gap-3.5 items-center flex-wrap">
    <div class="text-xs text-fg-2">
      {$ti('admin.rev.dataState', { months: o.snapshotMonths, estimated: o.estimatedMonths })}
    </div>
    <span class="flex-1"></span>
    <form method="POST" action="?/snapshot">
      <button type="submit" class="btn bg-fg text-bg">
        {$t('admin.rev.captureNow')}
      </button>
    </form>
    <form method="POST" action="?/backfill">
      <button type="submit" class="btn btn-secondary">
        {$t('admin.rev.backfill')}
      </button>
    </form>
  </div>

  <div>
    <div class="label mb-2.5 flex items-center gap-[5px]">
      {$t('admin.rev.section.recurring')}
      <InfoTooltip text={$t('admin.rev.section.recurring.info')} />
    </div>
    <div class="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
      <AdminKpiCard label={$t('admin.rev.mrr')} value={eur(o.mrrCents)} info={$t('admin.rev.mrr.info')} />
      <AdminKpiCard label={$t('admin.rev.arr')} value={eur(o.arrCents)} info={$t('admin.rev.arr.info')} />
      <AdminKpiCard label={$t('admin.rev.payingCustomers')} value={o.payingCustomers} sub={$ti('admin.rev.trialsSub', { n: o.trialCustomers })} info={$t('admin.rev.payingCustomers.info')} />
      <AdminKpiCard label={$t('admin.rev.arpa')} value={eur2(o.arpaCents)} info={$t('admin.rev.arpa.info')} />
      <AdminKpiCard label={$t('admin.rev.acv')} value={eur(o.acvCents)} info={$t('admin.rev.acv.info')} />
      <AdminKpiCard label={$t('admin.rev.atRisk')} value={eur(o.atRiskMrrCents)}
        valueColor={o.atRiskMrrCents > 0 ? 'var(--mep-neg)' : 'var(--mep-fg)'}
        sub={$ti('admin.rev.atRiskSub', { n: o.atRiskCustomers })} info={$t('admin.rev.atRisk.info')} />
    </div>
  </div>

  <div>
    <div class="label mb-2.5 flex items-center gap-[5px]">
      {$t('admin.rev.section.unitEconomics')}
      <InfoTooltip text={$t('admin.rev.section.unitEconomics.info')} />
    </div>
    <div class="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
      <AdminKpiCard label={$t('admin.rev.cac')} value={o.cacCents === null ? '—' : eur2(o.cacCents)}
        sub={$ti('admin.rev.cacBasis', { spend: eur(o.cacSpendCents), n: o.cacNewCustomers, from: o.cacWindowFrom, to: o.cacWindowTo })}
        info={$t('admin.rev.cac.info')} />
      <AdminKpiCard label={$t('admin.rev.ltv')} value={eur(o.ltvCents)}
        sub={$ti('admin.rev.ltvBasis', { months: months(o.lifetimeMonths), margin: o.assumptions.grossMarginPct })}
        info={$t('admin.rev.ltv.info')} />
      <AdminKpiCard label={$t('admin.rev.ltvCac')} value={o.ltvCacRatio === null ? '—' : num(o.ltvCacRatio, 1) + '×'}
        valueColor={HEALTH_COLOR[ratioHealth(o.ltvCacRatio)]}
        sub={$ti('admin.rev.target', { n: HEALTHY_LTV_CAC_RATIO })}
        info={$t('admin.rev.ltvCac.info')} />
      <AdminKpiCard label={$t('admin.rev.payback')} value={months(o.paybackMonths)}
        valueColor={HEALTH_COLOR[paybackHealth(o.paybackMonths)]}
        sub={$t('admin.rev.monthsUnit')}
        info={$t('admin.rev.payback.info')} />
    </div>
  </div>

  <div>
    <div class="label mb-2.5 flex items-center gap-[5px]">
      {$t('admin.rev.section.retention')}
      <InfoTooltip text={$t('admin.rev.section.retention.info')} />
    </div>
    <div class="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
      <AdminKpiCard label={$t('admin.rev.nrrAnnual')} value={pct(o.nrrAnnual)} valueColor={HEALTH_COLOR[retentionHealth(o.nrrAnnual)]} info={$t('admin.rev.nrrAnnual.info')} />
      <AdminKpiCard label={$t('admin.rev.nrrMonthly')} value={pct(o.nrrMonthly)} valueColor={HEALTH_COLOR[retentionHealth(o.nrrMonthly)]} info={$t('admin.rev.nrrMonthly.info')} />
      <AdminKpiCard label={$t('admin.rev.grr')} value={pct(o.grrMonthly)} info={$t('admin.rev.grr.info')} />
      <AdminKpiCard label={$t('admin.rev.logoChurn')} value={pct(o.logoChurn)} valueColor={HEALTH_COLOR[churnHealth(o.logoChurn)]} info={$t('admin.rev.logoChurn.info')} />
      <AdminKpiCard label={$t('admin.rev.revenueChurn')} value={pct(o.revenueChurn)} valueColor={HEALTH_COLOR[churnHealth(o.revenueChurn)]} info={$t('admin.rev.revenueChurn.info')} />
      <AdminKpiCard label={$t('admin.rev.avgChurn')} value={pct(o.avgMonthlyChurn)} info={$t('admin.rev.avgChurn.info')} />
    </div>
  </div>

  <SectionCard
    title={o.movementMonth ? $ti('admin.rev.section.movement', { from: o.movementMonth, to: o.month }) : $t('admin.rev.section.movementEmpty')}
    noPad>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.movement.info')} side="right" />
    {/snippet}
    {#if o.movement}
      {@const m = o.movement}
      <AdminTableScroll>
        <table class="w-full border-collapse text-[13px]">
          <tbody>
            {#each [
              { key: 'admin.rev.mov.start', value: m.startCents, cls: 'text-fg' },
              { key: 'admin.rev.mov.new', value: m.newCents, cls: 'text-pos' },
              { key: 'admin.rev.mov.reactivation', value: m.reactivationCents, cls: 'text-pos' },
              { key: 'admin.rev.mov.expansion', value: m.expansionCents, cls: 'text-pos' },
              { key: 'admin.rev.mov.contraction', value: -m.contractionCents, cls: 'text-warn' },
              { key: 'admin.rev.mov.churned', value: -m.churnedCents, cls: 'text-neg' },
              { key: 'admin.rev.mov.end', value: m.endCents, cls: 'text-fg' },
            ] as row}
              <tr class="border-b border-divider">
                <td class="py-[9px] px-4 text-fg-2">{$t(row.key)}</td>
                <td class="num py-[9px] px-4 text-right font-semibold {row.cls}">{eur(row.value)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    {:else}
      <div class="py-6 px-4 text-center text-fg-4 text-[13px]">{$t('admin.rev.insufficient')}</div>
    {/if}
  </SectionCard>

  <SectionCard title={$t('admin.rev.section.history')} noPad>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.history.info')} side="right" />
    {/snippet}
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colMonth')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.mrr')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colCustomers')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colSource')}</th>
          </tr>
        </thead>
        <tbody>
          {#each [...o.history].reverse() as row}
            <tr class="border-b border-divider">
              <td class="num py-[9px] px-4 text-fg font-medium">{row.month}</td>
              <td class="num py-[9px] px-4 text-right text-fg-2">{eur(row.mrrCents)}</td>
              <td class="num py-[9px] px-4 text-right text-fg-2">{row.payingCustomers}</td>
              <td class="py-[9px] px-4 text-right text-fg-4 text-xs">{$t('admin.rev.source.' + row.source)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <div>
    <SectionCard title={$t('admin.rev.section.cohorts')} noPad>
      {#snippet headerRight()}
        <InfoTooltip text={$t('admin.rev.section.cohorts.info')} side="right" />
      {/snippet}
      <AdminTableScroll>
        <table class="w-full border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-divider">
              <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colCohort')}</th>
              <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colSize')}</th>
              <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colStartMrr')}</th>
              {#each COHORT_OFFSETS as offset}
                <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$ti('admin.rev.colMonthOffset', { n: offset })}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each o.cohorts as cohort}
              <tr class="border-b border-divider">
                <td class="num py-[9px] px-4 text-fg font-medium">{cohort.month}</td>
                <td class="num py-[9px] px-4 text-right text-fg-2">{cohort.customers}</td>
                <td class="num py-[9px] px-4 text-right text-fg-2">{eur(cohort.startMrrCents)}</td>
                {#each cohort.retention as point, i}
                  {@const revenue = cohort.revenueRetention[i]?.rate ?? null}
                  <td class="num py-[9px] px-4 text-right text-fg-2">
                    {pct(point.rate)}
                    {#if revenue !== null}
                      <span class="text-fg-4 text-[11px]"> · {pct(revenue)}</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {:else}
              <tr><td colspan={3 + COHORT_OFFSETS.length} class="py-6 px-4 text-center text-fg-4">{$t('admin.rev.noCohorts')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </SectionCard>
    <div class="text-[11px] text-fg-4 mt-1.5">{$t('admin.rev.cohortsHint')}</div>
  </div>

  <SectionCard title={$t('admin.rev.section.funnel')} noPad>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.funnel.info')} side="right" />
    {/snippet}
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <tbody>
          {#each o.funnel as stage}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4 text-fg-2">{$t('admin.rev.funnel.' + stage.key)}</td>
              <td class="num py-[9px] px-4 text-right font-semibold text-fg">{stage.count}</td>
              <td class="num py-[9px] px-4 text-right text-xs {stage.dropFromPrevious ? 'text-neg' : 'text-fg-4'}">
                {stage.dropFromPrevious === null ? '—' : '−' + stage.dropFromPrevious}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.rev.section.leakage')} noPad>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.leakage.info')} side="right" />
    {/snippet}
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colLeak')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colCount')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colImpact')}</th>
          </tr>
        </thead>
        <tbody>
          {#each o.leaks as leak}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4 text-fg-2">
                <span class="font-medium {leak.count > 0 ? SEVERITY_CLASS[leak.severity] : 'text-fg-4'}">{$t('admin.rev.leak.' + leak.key)}</span>
                <div class="text-[11px] text-fg-4 mt-0.5">{$t('admin.rev.leakHint.' + leak.key)}</div>
              </td>
              <td class="num py-[9px] px-4 text-right font-semibold {leak.count > 0 ? SEVERITY_CLASS[leak.severity] : 'text-fg-4'}">{leak.count}</td>
              <td class="num py-[9px] px-4 text-right text-fg-2">{leak.monthlyImpactCents > 0 ? eur(leak.monthlyImpactCents) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.rev.section.spend')} noPad>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.spend.info')} side="right" />
    {/snippet}
    <div class="p-4 border-b border-divider">
      <form method="POST" action="?/addCost" class="flex gap-2.5 flex-wrap items-end">
        <label class="flex flex-col gap-1 text-[11px] text-fg-3">
          {$t('admin.rev.fieldMonth')}
          <input name="month" type="month" value={o.cacWindowTo} required class="input w-[150px]" />
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-fg-3">
          {$t('admin.rev.fieldCategory')}
          <select name="category" class="input">
            {#each data.categories as category}
              <option value={category}>{$t('admin.rev.cat.' + category)}</option>
            {/each}
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-fg-3">
          {$t('admin.rev.fieldAmount')}
          <input name="amount" inputmode="decimal" required class="input w-[120px]" />
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-fg-3 flex-1 min-w-[180px]">
          {$t('admin.rev.fieldNote')}
          <input name="note" maxlength="200" class="input w-full" />
        </label>
        <button type="submit" class="btn bg-fg text-bg">
          {$t('admin.rev.addCost')}
        </button>
      </form>
    </div>

    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colMonth')}</th>
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colCategory')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colAmount')}</th>
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase">{$t('admin.rev.colNote')}</th>
            <th scope="col" class="py-2.5 px-4"></th>
          </tr>
        </thead>
        <tbody>
          {#each o.costs as cost}
            <tr class="border-b border-divider">
              <td class="num py-[9px] px-4 text-fg">{cost.month}</td>
              <td class="py-[9px] px-4 text-fg-2">{$t('admin.rev.cat.' + cost.category)}</td>
              <td class="num py-[9px] px-4 text-right text-fg font-medium">{eur2(cost.amountCents)}</td>
              <td class="py-[9px] px-4 text-fg-3 text-xs">{cost.note ?? ''}</td>
              <td class="py-[9px] px-4 text-right">
                <form method="POST" action="?/deleteCost">
                  <input type="hidden" name="id" value={cost.id} />
                  <button type="submit" class="bg-transparent border-0 text-neg text-xs cursor-pointer p-0">
                    {$t('admin.rev.delete')}
                  </button>
                </form>
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" class="py-6 px-4 text-center text-fg-4">{$t('admin.rev.noCosts')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.rev.section.assumptions')}>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.assumptions.info')} side="right" />
    {/snippet}
    <form method="POST" action="?/saveAssumptions" class="flex gap-3 flex-wrap items-end">
      <label class="flex flex-col gap-1 text-[11px] text-fg-3">
        {$t('admin.rev.grossMargin')}
        <input name="grossMarginPct" value={o.assumptions.grossMarginPct} inputmode="decimal" class="input w-[100px]" />
      </label>
      <label class="flex flex-col gap-1 text-[11px] text-fg-3">
        {$t('admin.rev.ltvHorizon')}
        <input name="ltvHorizonMonths" value={o.assumptions.ltvHorizonMonths} inputmode="numeric" class="input w-[100px]" />
      </label>
      <label class="flex flex-col gap-1 text-[11px] text-fg-3">
        {$t('admin.rev.cacWindow')}
        <input name="cacWindowMonths" value={o.assumptions.cacWindowMonths} inputmode="numeric" class="input w-[100px]" />
      </label>
      <button type="submit" class="btn bg-fg text-bg">
        {$t('admin.rev.saveAssumptions')}
      </button>
      <span class="text-[11px] text-fg-4 flex-1 min-w-[200px]">{$t('admin.rev.assumptionsHint')}</span>
    </form>
    <div class="text-[11px] text-fg-4 mt-2">
      {$t('admin.rev.priceBasis')}
      {#each o.priceByTier as price}
        <span class="num ml-2">{price.tier}: {eur(price.monthlyCents)}</span>
      {/each}
    </div>
  </SectionCard>

  <a href="/admin" class="text-[13px] text-acc no-underline">{$t('admin.backToOverview')}</a>

</div>
