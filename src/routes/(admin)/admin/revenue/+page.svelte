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
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const HEALTH_CLASS: Record<Health, string> = {
    good:    'text-pos',
    warn:    'text-warn',
    bad:     'text-neg',
    unknown: 'text-fg-3',
  };

  const SEVERITY_CLASS: Record<string, string> = {
    info:  'text-fg-3',
    warn:  'text-warn',
    error: 'text-neg',
  };

  const o = $derived(data.overview);

  function eur(cents: number): string {
    return fmtEurCompact((cents / 100) || 0, locale.current);
  }

  function eur2(cents: number): string {
    return fmtEur(cents / 100, locale.current);
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

<AdminPageHead route="/admin/revenue" title={t('admin.rev.title')}>
  {#snippet right()}
    <div class="text-right">
      <div class="num text-xs text-fg-3">{o.month}</div>
      <div class="num text-[11.5px] text-fg-4 mt-0.5">
        {o.lastCapturedAt
          ? ti('admin.rev.lastCapture', { time: new Date(o.lastCapturedAt).toLocaleString('en-GB') })
          : t('admin.rev.never')}
      </div>
    </div>
  {/snippet}
</AdminPageHead>

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  {#if form && 'error' in form && typeof form.error === 'string'}
    <div style="background:#0a0c11;border:1px solid rgba(248,113,113,0.35);border-radius:10px;padding:10px 14px;color:#f87171;font-size:13px;">{t(form.error)}</div>
  {/if}

  <div style="background:#0a0c11;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
    <div style="font-size:11.5px;color:#5b6472;">
      {ti('admin.rev.dataState', { months: o.snapshotMonths, estimated: o.estimatedMonths })}
    </div>
    <span style="flex:1;"></span>
    <form method="POST" action="?/snapshot">
      <button type="submit" class="btn bg-fg text-bg">
        {t('admin.rev.captureNow')}
      </button>
    </form>
    <form method="POST" action="?/backfill">
      <button type="submit" class="btn btn-secondary">
        {t('admin.rev.backfill')}
      </button>
    </form>
  </div>

  <HudPanel title={t('admin.rev.section.recurring')} sub={t('admin.rev.section.recurring.info')}>
    <div class="hud-kpi-row">
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.mrr')}</span>
        <span class="hud-kpi-value">{eur(o.mrrCents)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.arr')}</span>
        <span class="hud-kpi-value">{eur(o.arrCents)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.payingCustomers')}</span>
        <span class="hud-kpi-value">{o.payingCustomers}</span>
        <span style="font:500 10px/1.3 ui-monospace, monospace;color:#5b6472;">{ti('admin.rev.trialsSub', { n: o.trialCustomers })}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.arpa')}</span>
        <span class="hud-kpi-value">{eur2(o.arpaCents)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.acv')}</span>
        <span class="hud-kpi-value">{eur(o.acvCents)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.atRisk')}</span>
        <span class="hud-kpi-value" class:bad={o.atRiskMrrCents > 0}>{eur(o.atRiskMrrCents)}</span>
        <span style="font:500 10px/1.3 ui-monospace, monospace;color:#5b6472;">{ti('admin.rev.atRiskSub', { n: o.atRiskCustomers })}</span>
      </div>
    </div>
  </HudPanel>

  <HudPanel title={t('admin.rev.section.unitEconomics')} sub={t('admin.rev.section.unitEconomics.info')}>
    <div class="hud-kpi-row">
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.cac')}</span>
        <span class="hud-kpi-value">{o.cacCents === null ? '—' : eur2(o.cacCents)}</span>
        <span style="font:500 10px/1.3 ui-monospace, monospace;color:#5b6472;">
          {ti('admin.rev.cacBasis', { spend: eur(o.cacSpendCents), n: o.cacNewCustomers, from: o.cacWindowFrom, to: o.cacWindowTo })}
        </span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.ltv')}</span>
        <span class="hud-kpi-value">{eur(o.ltvCents)}</span>
        <span style="font:500 10px/1.3 ui-monospace, monospace;color:#5b6472;">
          {ti('admin.rev.ltvBasis', { months: months(o.lifetimeMonths), margin: o.assumptions.grossMarginPct })}
        </span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.ltvCac')}</span>
        <span class="hud-kpi-value"
          class:good={ratioHealth(o.ltvCacRatio) === 'good'}
          class:warn={ratioHealth(o.ltvCacRatio) === 'warn'}
          class:bad={ratioHealth(o.ltvCacRatio) === 'bad'}>
          {o.ltvCacRatio === null ? '—' : num(o.ltvCacRatio, 1) + '×'}
        </span>
        <span style="font:500 10px/1.3 ui-monospace, monospace;color:#5b6472;">{ti('admin.rev.target', { n: HEALTHY_LTV_CAC_RATIO })}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.payback')}</span>
        <span class="hud-kpi-value"
          class:good={paybackHealth(o.paybackMonths) === 'good'}
          class:warn={paybackHealth(o.paybackMonths) === 'warn'}
          class:bad={paybackHealth(o.paybackMonths) === 'bad'}>
          {months(o.paybackMonths)}
        </span>
        <span style="font:500 10px/1.3 ui-monospace, monospace;color:#5b6472;">{t('admin.rev.monthsUnit')}</span>
      </div>
    </div>
  </HudPanel>

  <HudPanel title={t('admin.rev.section.retention')} sub={t('admin.rev.section.retention.info')}>
    <div class="hud-kpi-row">
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.nrrAnnual')}</span>
        <span class="hud-kpi-value"
          class:good={retentionHealth(o.nrrAnnual) === 'good'}
          class:warn={retentionHealth(o.nrrAnnual) === 'warn'}
          class:bad={retentionHealth(o.nrrAnnual) === 'bad'}>{pct(o.nrrAnnual)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.nrrMonthly')}</span>
        <span class="hud-kpi-value"
          class:good={retentionHealth(o.nrrMonthly) === 'good'}
          class:warn={retentionHealth(o.nrrMonthly) === 'warn'}
          class:bad={retentionHealth(o.nrrMonthly) === 'bad'}>{pct(o.nrrMonthly)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.grr')}</span>
        <span class="hud-kpi-value">{pct(o.grrMonthly)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.logoChurn')}</span>
        <span class="hud-kpi-value"
          class:good={churnHealth(o.logoChurn) === 'good'}
          class:warn={churnHealth(o.logoChurn) === 'warn'}
          class:bad={churnHealth(o.logoChurn) === 'bad'}>{pct(o.logoChurn)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.revenueChurn')}</span>
        <span class="hud-kpi-value"
          class:good={churnHealth(o.revenueChurn) === 'good'}
          class:warn={churnHealth(o.revenueChurn) === 'warn'}
          class:bad={churnHealth(o.revenueChurn) === 'bad'}>{pct(o.revenueChurn)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.rev.avgChurn')}</span>
        <span class="hud-kpi-value">{pct(o.avgMonthlyChurn)}</span>
      </div>
    </div>
  </HudPanel>

  <HudPanel
    title={o.movementMonth ? ti('admin.rev.section.movement', { from: o.movementMonth, to: o.month }) : t('admin.rev.section.movementEmpty')}
    sub={t('admin.rev.section.movement.info')}>
    {#if o.movement}
      {@const m = o.movement}
      <AdminTableScroll>
        <table class="hud-table">
          <tbody>
            {#each [
              { key: 'admin.rev.mov.start', value: m.startCents, cls: '' },
              { key: 'admin.rev.mov.new', value: m.newCents, cls: 'good' },
              { key: 'admin.rev.mov.reactivation', value: m.reactivationCents, cls: 'good' },
              { key: 'admin.rev.mov.expansion', value: m.expansionCents, cls: 'good' },
              { key: 'admin.rev.mov.contraction', value: -m.contractionCents, cls: 'warn' },
              { key: 'admin.rev.mov.churned', value: -m.churnedCents, cls: 'bad' },
              { key: 'admin.rev.mov.end', value: m.endCents, cls: '' },
            ] as row}
              <tr>
                <td class="dim">{t(row.key)}</td>
                <td class="num r" class:good={row.cls === 'good'} class:warn={row.cls === 'warn'} class:bad={row.cls === 'bad'}>{eur(row.value)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    {:else}
      <div style="padding:24px 14px;text-align:center;color:#5b6472;font-size:12.5px;">{t('admin.rev.insufficient')}</div>
    {/if}
  </HudPanel>

  <HudPanel title={t('admin.rev.section.history')} sub={t('admin.rev.section.history.info')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{t('admin.rev.colMonth')}</th>
            <th scope="col" class="r">{t('admin.rev.mrr')}</th>
            <th scope="col" class="r">{t('admin.rev.colCustomers')}</th>
            <th scope="col" class="r">{t('admin.rev.colSource')}</th>
          </tr>
        </thead>
        <tbody>
          {#each [...o.history].reverse() as row}
            <tr>
              <td class="mono">{row.month}</td>
              <td class="num r dim">{eur(row.mrrCents)}</td>
              <td class="num r dim">{row.payingCustomers}</td>
              <td class="r dim nowrap">{t('admin.rev.source.' + row.source)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <div>
    <HudPanel title={t('admin.rev.section.cohorts')} sub={t('admin.rev.section.cohorts.info')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{t('admin.rev.colCohort')}</th>
              <th scope="col" class="r">{t('admin.rev.colSize')}</th>
              <th scope="col" class="r">{t('admin.rev.colStartMrr')}</th>
              {#each COHORT_OFFSETS as offset}
                <th scope="col" class="r">{ti('admin.rev.colMonthOffset', { n: offset })}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each o.cohorts as cohort}
              <tr>
                <td class="mono">{cohort.month}</td>
                <td class="num r dim">{cohort.customers}</td>
                <td class="num r dim">{eur(cohort.startMrrCents)}</td>
                {#each cohort.retention as point, i}
                  {@const revenue = cohort.revenueRetention[i]?.rate ?? null}
                  <td class="num r dim">
                    {pct(point.rate)}
                    {#if revenue !== null}
                      <span style="color:#3a4150;font-size:10px;"> · {pct(revenue)}</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {:else}
              <tr><td colspan={3 + COHORT_OFFSETS.length} class="empty">{t('admin.rev.noCohorts')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>
    <div style="font-size:11px;color:#5b6472;margin-top:6px;">{t('admin.rev.cohortsHint')}</div>
  </div>

  <HudPanel title={t('admin.rev.section.funnel')} sub={t('admin.rev.section.funnel.info')}>
    <AdminTableScroll>
      <table class="hud-table">
        <tbody>
          {#each o.funnel as stage}
            <tr>
              <td class="dim">{t('admin.rev.funnel.' + stage.key)}</td>
              <td class="num r">{stage.count}</td>
              <td class="num r" class:bad={!!stage.dropFromPrevious} class:dim={!stage.dropFromPrevious}>
                {stage.dropFromPrevious === null ? '—' : '−' + stage.dropFromPrevious}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <HudPanel title={t('admin.rev.section.leakage')} sub={t('admin.rev.section.leakage.info')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{t('admin.rev.colLeak')}</th>
            <th scope="col" class="r">{t('admin.rev.colCount')}</th>
            <th scope="col" class="r">{t('admin.rev.colImpact')}</th>
          </tr>
        </thead>
        <tbody>
          {#each o.leaks as leak}
            <tr>
              <td>
                <span style="font-weight:500;color:{leak.count === 0 ? '#5b6472' : leak.severity === 'warn' ? '#fbbf24' : leak.severity === 'error' ? '#f87171' : '#e7edf5'};">
                  {t('admin.rev.leak.' + leak.key)}
                </span>
                <div style="font-size:10.5px;color:#5b6472;margin-top:1px;">{t('admin.rev.leakHint.' + leak.key)}</div>
              </td>
              <td class="num r" class:warn={leak.count > 0 && leak.severity === 'warn'} class:bad={leak.count > 0 && leak.severity === 'error'} class:dim={leak.count === 0}>{leak.count}</td>
              <td class="num r dim">{leak.monthlyImpactCents > 0 ? eur(leak.monthlyImpactCents) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <HudPanel title={t('admin.rev.section.spend')} sub={t('admin.rev.section.spend.info')}>
    <div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <form method="POST" action="?/addCost" class="flex gap-2.5 flex-wrap items-end">
        <label class="flex flex-col gap-1 text-[11px]" style="color:#5b6472;">
          {t('admin.rev.fieldMonth')}
          <input name="month" type="month" value={o.cacWindowTo} required class="input w-[150px]" />
        </label>
        <label class="flex flex-col gap-1 text-[11px]" style="color:#5b6472;">
          {t('admin.rev.fieldCategory')}
          <select name="category" class="input">
            {#each data.categories as category}
              <option value={category}>{t('admin.rev.cat.' + category)}</option>
            {/each}
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[11px]" style="color:#5b6472;">
          {t('admin.rev.fieldAmount')}
          <input name="amount" inputmode="decimal" required class="input w-[120px]" />
        </label>
        <label class="flex flex-col gap-1 text-[11px] flex-1 min-w-[180px]" style="color:#5b6472;">
          {t('admin.rev.fieldNote')}
          <input name="note" maxlength="200" class="input w-full" />
        </label>
        <button type="submit" class="btn bg-fg text-bg">
          {t('admin.rev.addCost')}
        </button>
      </form>
    </div>

    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{t('admin.rev.colMonth')}</th>
            <th scope="col" class="l">{t('admin.rev.colCategory')}</th>
            <th scope="col" class="r">{t('admin.rev.colAmount')}</th>
            <th scope="col" class="l">{t('admin.rev.colNote')}</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {#each o.costs as cost}
            <tr>
              <td class="mono">{cost.month}</td>
              <td class="dim">{t('admin.rev.cat.' + cost.category)}</td>
              <td class="num r">{eur2(cost.amountCents)}</td>
              <td class="dim">{cost.note ?? ''}</td>
              <td class="r">
                <form method="POST" action="?/deleteCost">
                  <input type="hidden" name="id" value={cost.id} />
                  <button type="submit" style="background:transparent;border:0;color:#f87171;font-size:11px;cursor:pointer;padding:0;">
                    {t('admin.rev.delete')}
                  </button>
                </form>
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" class="empty">{t('admin.rev.noCosts')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <HudPanel title={t('admin.rev.section.assumptions')} sub={t('admin.rev.section.assumptions.info')}>
    <div style="padding:12px 14px;">
      <form method="POST" action="?/saveAssumptions" class="flex gap-3 flex-wrap items-end">
        <label class="flex flex-col gap-1 text-[11px]" style="color:#5b6472;">
          {t('admin.rev.grossMargin')}
          <input name="grossMarginPct" value={o.assumptions.grossMarginPct} inputmode="decimal" class="input w-[100px]" />
        </label>
        <label class="flex flex-col gap-1 text-[11px]" style="color:#5b6472;">
          {t('admin.rev.ltvHorizon')}
          <input name="ltvHorizonMonths" value={o.assumptions.ltvHorizonMonths} inputmode="numeric" class="input w-[100px]" />
        </label>
        <label class="flex flex-col gap-1 text-[11px]" style="color:#5b6472;">
          {t('admin.rev.cacWindow')}
          <input name="cacWindowMonths" value={o.assumptions.cacWindowMonths} inputmode="numeric" class="input w-[100px]" />
        </label>
        <button type="submit" class="btn bg-fg text-bg">
          {t('admin.rev.saveAssumptions')}
        </button>
        <span style="font-size:11px;color:#5b6472;flex:1;min-width:200px;">{t('admin.rev.assumptionsHint')}</span>
      </form>
      <div style="font-size:11px;color:#5b6472;margin-top:10px;">
        {t('admin.rev.priceBasis')}
        {#each o.priceByTier as price}
          <span class="num" style="margin-left:8px;color:#e7edf5;">{price.tier}: {eur(price.monthlyCents)}</span>
        {/each}
      </div>
    </div>
  </HudPanel>

</div>
