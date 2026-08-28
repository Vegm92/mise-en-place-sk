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

  const SEVERITY_COLOR: Record<string, string> = {
    info:  'var(--mep-fg-3)',
    warn:  'var(--mep-warn)',
    error: 'var(--mep-neg)',
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
    <div style="text-align:right;">
      <div class="num" style="font-size:12px;color:var(--mep-fg-3);">{o.month}</div>
      <div class="num" style="font-size:11.5px;color:var(--mep-fg-4);margin-top:2px;">
        {o.lastCapturedAt
          ? $ti('admin.rev.lastCapture', { time: new Date(o.lastCapturedAt).toLocaleString('en-GB') })
          : $t('admin.rev.never')}
      </div>
    </div>
  {/snippet}
</AdminPageHead>

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:14px;">

  {#if form && 'error' in form && typeof form.error === 'string'}
    <div class="card" style="padding:10px 14px;border-color:var(--mep-neg);color:var(--mep-neg);font-size:13px;">{$t(form.error)}</div>
  {/if}

  <div class="card" style="padding:14px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
    <div style="font-size:12px;color:var(--mep-fg-2);">
      {$ti('admin.rev.dataState', { months: o.snapshotMonths, estimated: o.estimatedMonths })}
    </div>
    <span style="flex:1;"></span>
    <form method="POST" action="?/snapshot">
      <button type="submit" class="btn" style="background:var(--mep-fg);color:var(--mep-bg);">
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
    <div class="label" style="margin-bottom:10px;display:flex;align-items:center;gap:5px;">
      {$t('admin.rev.section.recurring')}
      <InfoTooltip text={$t('admin.rev.section.recurring.info')} />
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;">
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
    <div class="label" style="margin-bottom:10px;display:flex;align-items:center;gap:5px;">
      {$t('admin.rev.section.unitEconomics')}
      <InfoTooltip text={$t('admin.rev.section.unitEconomics.info')} />
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
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
    <div class="label" style="margin-bottom:10px;display:flex;align-items:center;gap:5px;">
      {$t('admin.rev.section.retention')}
      <InfoTooltip text={$t('admin.rev.section.retention.info')} />
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;">
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
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tbody>
            {#each [
              { key: 'admin.rev.mov.start', value: m.startCents, color: 'var(--mep-fg)' },
              { key: 'admin.rev.mov.new', value: m.newCents, color: 'var(--mep-pos)' },
              { key: 'admin.rev.mov.reactivation', value: m.reactivationCents, color: 'var(--mep-pos)' },
              { key: 'admin.rev.mov.expansion', value: m.expansionCents, color: 'var(--mep-pos)' },
              { key: 'admin.rev.mov.contraction', value: -m.contractionCents, color: 'var(--mep-warn)' },
              { key: 'admin.rev.mov.churned', value: -m.churnedCents, color: 'var(--mep-neg)' },
              { key: 'admin.rev.mov.end', value: m.endCents, color: 'var(--mep-fg)' },
            ] as row}
              <tr style="border-bottom:1px solid var(--mep-divider);">
                <td style="padding:9px 16px;color:var(--mep-fg-2);">{$t(row.key)}</td>
                <td style="padding:9px 16px;text-align:right;font-weight:600;color:{row.color};" class="num">{eur(row.value)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    {:else}
      <div style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);font-size:13px;">{$t('admin.rev.insufficient')}</div>
    {/if}
  </SectionCard>

  <SectionCard title={$t('admin.rev.section.history')} noPad>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.history.info')} side="right" />
    {/snippet}
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colMonth')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.mrr')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colCustomers')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colSource')}</th>
          </tr>
        </thead>
        <tbody>
          {#each [...o.history].reverse() as row}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg);font-weight:500;" class="num">{row.month}</td>
              <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{eur(row.mrrCents)}</td>
              <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{row.payingCustomers}</td>
              <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-4);font-size:12px;">{$t('admin.rev.source.' + row.source)}</td>
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
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colCohort')}</th>
              <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colSize')}</th>
              <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colStartMrr')}</th>
              {#each COHORT_OFFSETS as offset}
                <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$ti('admin.rev.colMonthOffset', { n: offset })}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each o.cohorts as cohort}
              <tr style="border-bottom:1px solid var(--mep-divider);">
                <td style="padding:9px 16px;color:var(--mep-fg);font-weight:500;" class="num">{cohort.month}</td>
                <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{cohort.customers}</td>
                <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{eur(cohort.startMrrCents)}</td>
                {#each cohort.retention as point, i}
                  {@const revenue = cohort.revenueRetention[i]?.rate ?? null}
                  <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">
                    {pct(point.rate)}
                    {#if revenue !== null}
                      <span style="color:var(--mep-fg-4);font-size:11px;"> · {pct(revenue)}</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {:else}
              <tr><td colspan={3 + COHORT_OFFSETS.length} style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.rev.noCohorts')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </SectionCard>
    <div style="font-size:11px;color:var(--mep-fg-4);margin-top:6px;">{$t('admin.rev.cohortsHint')}</div>
  </div>

  <SectionCard title={$t('admin.rev.section.funnel')} noPad>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.funnel.info')} side="right" />
    {/snippet}
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>
          {#each o.funnel as stage}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg-2);">{$t('admin.rev.funnel.' + stage.key)}</td>
              <td style="padding:9px 16px;text-align:right;font-weight:600;color:var(--mep-fg);" class="num">{stage.count}</td>
              <td style="padding:9px 16px;text-align:right;color:{stage.dropFromPrevious ? 'var(--mep-neg)' : 'var(--mep-fg-4)'};font-size:12px;" class="num">
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
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colLeak')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colCount')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colImpact')}</th>
          </tr>
        </thead>
        <tbody>
          {#each o.leaks as leak}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg-2);">
                <span style="color:{leak.count > 0 ? SEVERITY_COLOR[leak.severity] : 'var(--mep-fg-4)'};font-weight:500;">{$t('admin.rev.leak.' + leak.key)}</span>
                <div style="font-size:11px;color:var(--mep-fg-4);margin-top:2px;">{$t('admin.rev.leakHint.' + leak.key)}</div>
              </td>
              <td style="padding:9px 16px;text-align:right;font-weight:600;color:{leak.count > 0 ? SEVERITY_COLOR[leak.severity] : 'var(--mep-fg-4)'};" class="num">{leak.count}</td>
              <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{leak.monthlyImpactCents > 0 ? eur(leak.monthlyImpactCents) : '—'}</td>
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
    <div style="padding:16px;border-bottom:1px solid var(--mep-divider);">
      <form method="POST" action="?/addCost" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mep-fg-3);">
          {$t('admin.rev.fieldMonth')}
          <input name="month" type="month" value={o.cacWindowTo} required class="input" style="width:150px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mep-fg-3);">
          {$t('admin.rev.fieldCategory')}
          <select name="category" class="input">
            {#each data.categories as category}
              <option value={category}>{$t('admin.rev.cat.' + category)}</option>
            {/each}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mep-fg-3);">
          {$t('admin.rev.fieldAmount')}
          <input name="amount" inputmode="decimal" required class="input" style="width:120px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mep-fg-3);flex:1;min-width:180px;">
          {$t('admin.rev.fieldNote')}
          <input name="note" maxlength="200" class="input" style="width:100%;" />
        </label>
        <button type="submit" class="btn" style="background:var(--mep-fg);color:var(--mep-bg);">
          {$t('admin.rev.addCost')}
        </button>
      </form>
    </div>

    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colMonth')}</th>
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colCategory')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colAmount')}</th>
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;">{$t('admin.rev.colNote')}</th>
            <th scope="col" style="padding:10px 16px;"></th>
          </tr>
        </thead>
        <tbody>
          {#each o.costs as cost}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg);" class="num">{cost.month}</td>
              <td style="padding:9px 16px;color:var(--mep-fg-2);">{$t('admin.rev.cat.' + cost.category)}</td>
              <td style="padding:9px 16px;text-align:right;color:var(--mep-fg);font-weight:500;" class="num">{eur2(cost.amountCents)}</td>
              <td style="padding:9px 16px;color:var(--mep-fg-3);font-size:12px;">{cost.note ?? ''}</td>
              <td style="padding:9px 16px;text-align:right;">
                <form method="POST" action="?/deleteCost">
                  <input type="hidden" name="id" value={cost.id} />
                  <button type="submit" style="background:none;border:0;color:var(--mep-neg);font-size:12px;cursor:pointer;padding:0;">
                    {$t('admin.rev.delete')}
                  </button>
                </form>
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.rev.noCosts')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.rev.section.assumptions')}>
    {#snippet headerRight()}
      <InfoTooltip text={$t('admin.rev.section.assumptions.info')} side="right" />
    {/snippet}
    <form method="POST" action="?/saveAssumptions" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mep-fg-3);">
        {$t('admin.rev.grossMargin')}
        <input name="grossMarginPct" value={o.assumptions.grossMarginPct} inputmode="decimal" class="input" style="width:100px;" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mep-fg-3);">
        {$t('admin.rev.ltvHorizon')}
        <input name="ltvHorizonMonths" value={o.assumptions.ltvHorizonMonths} inputmode="numeric" class="input" style="width:100px;" />
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mep-fg-3);">
        {$t('admin.rev.cacWindow')}
        <input name="cacWindowMonths" value={o.assumptions.cacWindowMonths} inputmode="numeric" class="input" style="width:100px;" />
      </label>
      <button type="submit" class="btn" style="background:var(--mep-fg);color:var(--mep-bg);">
        {$t('admin.rev.saveAssumptions')}
      </button>
      <span style="font-size:11px;color:var(--mep-fg-4);flex:1;min-width:200px;">{$t('admin.rev.assumptionsHint')}</span>
    </form>
    <div style="font-size:11px;color:var(--mep-fg-4);margin-top:8px;">
      {$t('admin.rev.priceBasis')}
      {#each o.priceByTier as price}
        <span style="margin-left:8px;" class="num">{price.tier}: {eur(price.monthlyCents)}</span>
      {/each}
    </div>
  </SectionCard>

  <a href="/admin" style="font-size:13px;color:var(--mep-acc);text-decoration:none;">{$t('admin.backToOverview')}</a>

</div>
