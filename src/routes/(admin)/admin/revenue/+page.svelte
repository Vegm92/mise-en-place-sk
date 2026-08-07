<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import {
    COHORT_OFFSETS,
    HEALTHY_LTV_CAC_RATIO,
    churnHealth,
    paybackHealth,
    ratioHealth,
    retentionHealth,
    type Health,
  } from '$lib/revenue-math';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const HEALTH_COLOR: Record<Health, string> = {
    good:    '#16a34a',
    warn:    '#d97706',
    bad:     '#dc2626',
    unknown: '#888',
  };

  const SEVERITY_COLOR: Record<string, string> = {
    info:  '#888',
    warn:  '#d97706',
    error: '#dc2626',
  };

  const o = $derived(data.overview);

  function eur(cents: number): string {
    return ((cents / 100) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
  }

  function eur2(cents: number): string {
    return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
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

<div style="padding:28px 32px;max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:24px;">

  <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;">
    <h2 style="margin:0;font-size:22px;font-weight:600;color:#111;letter-spacing:-0.3px;">{$t('admin.rev.title')}</h2>
    <span style="font-size:12px;color:#888;">{o.month}</span>
    <span style="flex:1;"></span>
    <span style="font-size:12px;color:#888;">
      {o.lastCapturedAt
        ? $ti('admin.rev.lastCapture', { time: new Date(o.lastCapturedAt).toLocaleString('en-GB') })
        : $t('admin.rev.never')}
    </span>
  </div>

  {#if form && 'error' in form && typeof form.error === 'string'}
    <div class="card" style="padding:10px 14px;border-color:#dc2626;color:#dc2626;font-size:13px;">{$t(form.error)}</div>
  {/if}

  <div class="card" style="padding:14px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
    <div style="font-size:12px;color:#555;">
      {$ti('admin.rev.dataState', { months: o.snapshotMonths, estimated: o.estimatedMonths })}
    </div>
    <span style="flex:1;"></span>
    <form method="POST" action="?/snapshot">
      <button type="submit" style="padding:6px 12px;background:#111;color:#fff;border:0;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">
        {$t('admin.rev.captureNow')}
      </button>
    </form>
    <form method="POST" action="?/backfill">
      <button type="submit" style="padding:6px 12px;background:#fff;color:#111;border:1px solid var(--mep-divider,#e5e5e5);border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;">
        {$t('admin.rev.backfill')}
      </button>
    </form>
  </div>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.recurring')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;">
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.mrr')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">{eur(o.mrrCents)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.arr')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">{eur(o.arrCents)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.payingCustomers')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">{o.payingCustomers}</div>
        <div style="font-size:11px;color:#aaa;margin-top:4px;">{$ti('admin.rev.trialsSub', { n: o.trialCustomers })}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.arpa')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">{eur2(o.arpaCents)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.acv')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">{eur(o.acvCents)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.atRisk')}</div>
        <div style="font-size:26px;font-weight:700;color:{o.atRiskMrrCents > 0 ? '#dc2626' : '#111'};letter-spacing:-0.5px;" class="num">{eur(o.atRiskMrrCents)}</div>
        <div style="font-size:11px;color:#aaa;margin-top:4px;">{$ti('admin.rev.atRiskSub', { n: o.atRiskCustomers })}</div>
      </div>
    </div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.unitEconomics')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.cac')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">
          {o.cacCents === null ? '—' : eur2(o.cacCents)}
        </div>
        <div style="font-size:11px;color:#aaa;margin-top:4px;">
          {$ti('admin.rev.cacBasis', { spend: eur(o.cacSpendCents), n: o.cacNewCustomers, from: o.cacWindowFrom, to: o.cacWindowTo })}
        </div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.ltv')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">{eur(o.ltvCents)}</div>
        <div style="font-size:11px;color:#aaa;margin-top:4px;">
          {$ti('admin.rev.ltvBasis', { months: months(o.lifetimeMonths), margin: o.assumptions.grossMarginPct })}
        </div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.ltvCac')}</div>
        <div style="font-size:26px;font-weight:700;color:{HEALTH_COLOR[ratioHealth(o.ltvCacRatio)]};letter-spacing:-0.5px;" class="num">
          {o.ltvCacRatio === null ? '—' : num(o.ltvCacRatio, 1) + '×'}
        </div>
        <div style="font-size:11px;color:#aaa;margin-top:4px;">{$ti('admin.rev.target', { n: HEALTHY_LTV_CAC_RATIO })}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.payback')}</div>
        <div style="font-size:26px;font-weight:700;color:{HEALTH_COLOR[paybackHealth(o.paybackMonths)]};letter-spacing:-0.5px;" class="num">
          {months(o.paybackMonths)}
        </div>
        <div style="font-size:11px;color:#aaa;margin-top:4px;">{$t('admin.rev.monthsUnit')}</div>
      </div>
    </div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.retention')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;">
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.nrrAnnual')}</div>
        <div style="font-size:26px;font-weight:700;color:{HEALTH_COLOR[retentionHealth(o.nrrAnnual)]};letter-spacing:-0.5px;" class="num">{pct(o.nrrAnnual)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.nrrMonthly')}</div>
        <div style="font-size:26px;font-weight:700;color:{HEALTH_COLOR[retentionHealth(o.nrrMonthly)]};letter-spacing:-0.5px;" class="num">{pct(o.nrrMonthly)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.grr')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">{pct(o.grrMonthly)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.logoChurn')}</div>
        <div style="font-size:26px;font-weight:700;color:{HEALTH_COLOR[churnHealth(o.logoChurn)]};letter-spacing:-0.5px;" class="num">{pct(o.logoChurn)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.revenueChurn')}</div>
        <div style="font-size:26px;font-weight:700;color:{HEALTH_COLOR[churnHealth(o.revenueChurn)]};letter-spacing:-0.5px;" class="num">{pct(o.revenueChurn)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:11px;color:#888;margin-bottom:6px;">{$t('admin.rev.avgChurn')}</div>
        <div style="font-size:26px;font-weight:700;color:#111;letter-spacing:-0.5px;" class="num">{pct(o.avgMonthlyChurn)}</div>
      </div>
    </div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {o.movementMonth ? $ti('admin.rev.section.movement', { from: o.movementMonth, to: o.month }) : $t('admin.rev.section.movementEmpty')}
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      {#if o.movement}
        {@const m = o.movement}
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tbody>
            {#each [
              { key: 'admin.rev.mov.start', value: m.startCents, color: '#111' },
              { key: 'admin.rev.mov.new', value: m.newCents, color: '#16a34a' },
              { key: 'admin.rev.mov.reactivation', value: m.reactivationCents, color: '#16a34a' },
              { key: 'admin.rev.mov.expansion', value: m.expansionCents, color: '#16a34a' },
              { key: 'admin.rev.mov.contraction', value: -m.contractionCents, color: '#d97706' },
              { key: 'admin.rev.mov.churned', value: -m.churnedCents, color: '#dc2626' },
              { key: 'admin.rev.mov.end', value: m.endCents, color: '#111' },
            ] as row}
              <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
                <td style="padding:9px 16px;color:#555;">{$t(row.key)}</td>
                <td style="padding:9px 16px;text-align:right;font-weight:600;color:{row.color};" class="num">{eur(row.value)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div style="padding:24px 16px;text-align:center;color:#aaa;font-size:13px;">{$t('admin.rev.insufficient')}</div>
      {/if}
    </div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.history')}
    </div>
    <div class="card" style="padding:0;overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colMonth')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.mrr')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colCustomers')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colSource')}</th>
          </tr>
        </thead>
        <tbody>
          {#each [...o.history].reverse() as row}
            <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
              <td style="padding:9px 16px;color:#111;font-weight:500;" class="num">{row.month}</td>
              <td style="padding:9px 16px;text-align:right;color:#555;" class="num">{eur(row.mrrCents)}</td>
              <td style="padding:9px 16px;text-align:right;color:#555;" class="num">{row.payingCustomers}</td>
              <td style="padding:9px 16px;text-align:right;color:#aaa;font-size:12px;">{$t('admin.rev.source.' + row.source)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.cohorts')}
    </div>
    <div class="card" style="padding:0;overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colCohort')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colSize')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colStartMrr')}</th>
            {#each COHORT_OFFSETS as offset}
              <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$ti('admin.rev.colMonthOffset', { n: offset })}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each o.cohorts as cohort}
            <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
              <td style="padding:9px 16px;color:#111;font-weight:500;" class="num">{cohort.month}</td>
              <td style="padding:9px 16px;text-align:right;color:#555;" class="num">{cohort.customers}</td>
              <td style="padding:9px 16px;text-align:right;color:#555;" class="num">{eur(cohort.startMrrCents)}</td>
              {#each cohort.retention as point, i}
                {@const revenue = cohort.revenueRetention[i]?.rate ?? null}
                <td style="padding:9px 16px;text-align:right;color:#555;" class="num">
                  {pct(point.rate)}
                  {#if revenue !== null}
                    <span style="color:#aaa;font-size:11px;"> · {pct(revenue)}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {:else}
            <tr><td colspan={3 + COHORT_OFFSETS.length} style="padding:24px 16px;text-align:center;color:#aaa;">{$t('admin.rev.noCohorts')}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div style="font-size:11px;color:#aaa;margin-top:6px;">{$t('admin.rev.cohortsHint')}</div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.funnel')}
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>
          {#each o.funnel as stage}
            <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
              <td style="padding:9px 16px;color:#555;">{$t('admin.rev.funnel.' + stage.key)}</td>
              <td style="padding:9px 16px;text-align:right;font-weight:600;color:#111;" class="num">{stage.count}</td>
              <td style="padding:9px 16px;text-align:right;color:{stage.dropFromPrevious ? '#dc2626' : '#aaa'};font-size:12px;" class="num">
                {stage.dropFromPrevious === null ? '—' : '−' + stage.dropFromPrevious}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.leakage')}
    </div>
    <div class="card" style="padding:0;overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colLeak')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colCount')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colImpact')}</th>
          </tr>
        </thead>
        <tbody>
          {#each o.leaks as leak}
            <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
              <td style="padding:9px 16px;color:#555;">
                <span style="color:{leak.count > 0 ? SEVERITY_COLOR[leak.severity] : '#aaa'};font-weight:500;">{$t('admin.rev.leak.' + leak.key)}</span>
                <div style="font-size:11px;color:#aaa;margin-top:2px;">{$t('admin.rev.leakHint.' + leak.key)}</div>
              </td>
              <td style="padding:9px 16px;text-align:right;font-weight:600;color:{leak.count > 0 ? SEVERITY_COLOR[leak.severity] : '#aaa'};" class="num">{leak.count}</td>
              <td style="padding:9px 16px;text-align:right;color:#555;" class="num">{leak.monthlyImpactCents > 0 ? eur(leak.monthlyImpactCents) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.spend')}
    </div>
    <div class="card" style="padding:16px;margin-bottom:12px;">
      <form method="POST" action="?/addCost" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#888;">
          {$t('admin.rev.fieldMonth')}
          <input name="month" type="month" value={o.cacWindowTo} required
            style="padding:6px 10px;border:1px solid var(--mep-divider,#e5e5e5);border-radius:6px;font-size:13px;width:150px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#888;">
          {$t('admin.rev.fieldCategory')}
          <select name="category" style="padding:6px 10px;border:1px solid var(--mep-divider,#e5e5e5);border-radius:6px;font-size:13px;">
            {#each data.categories as category}
              <option value={category}>{$t('admin.rev.cat.' + category)}</option>
            {/each}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#888;">
          {$t('admin.rev.fieldAmount')}
          <input name="amount" inputmode="decimal" required
            style="padding:6px 10px;border:1px solid var(--mep-divider,#e5e5e5);border-radius:6px;font-size:13px;width:120px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#888;flex:1;min-width:180px;">
          {$t('admin.rev.fieldNote')}
          <input name="note" maxlength="200"
            style="padding:6px 10px;border:1px solid var(--mep-divider,#e5e5e5);border-radius:6px;font-size:13px;width:100%;" />
        </label>
        <button type="submit" style="padding:7px 14px;background:#dc2626;color:#fff;border:0;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">
          {$t('admin.rev.addCost')}
        </button>
      </form>
    </div>

    <div class="card" style="padding:0;overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colMonth')}</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colCategory')}</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colAmount')}</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">{$t('admin.rev.colNote')}</th>
            <th style="padding:10px 16px;"></th>
          </tr>
        </thead>
        <tbody>
          {#each o.costs as cost}
            <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
              <td style="padding:9px 16px;color:#111;" class="num">{cost.month}</td>
              <td style="padding:9px 16px;color:#555;">{$t('admin.rev.cat.' + cost.category)}</td>
              <td style="padding:9px 16px;text-align:right;color:#111;font-weight:500;" class="num">{eur2(cost.amountCents)}</td>
              <td style="padding:9px 16px;color:#888;font-size:12px;">{cost.note ?? ''}</td>
              <td style="padding:9px 16px;text-align:right;">
                <form method="POST" action="?/deleteCost">
                  <input type="hidden" name="id" value={cost.id} />
                  <button type="submit" style="background:none;border:0;color:#dc2626;font-size:12px;cursor:pointer;padding:0;">
                    {$t('admin.rev.delete')}
                  </button>
                </form>
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" style="padding:24px 16px;text-align:center;color:#aaa;">{$t('admin.rev.noCosts')}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
      {$t('admin.rev.section.assumptions')}
    </div>
    <div class="card" style="padding:16px;">
      <form method="POST" action="?/saveAssumptions" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#888;">
          {$t('admin.rev.grossMargin')}
          <input name="grossMarginPct" value={o.assumptions.grossMarginPct} inputmode="decimal"
            style="padding:6px 10px;border:1px solid var(--mep-divider,#e5e5e5);border-radius:6px;font-size:13px;width:100px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#888;">
          {$t('admin.rev.ltvHorizon')}
          <input name="ltvHorizonMonths" value={o.assumptions.ltvHorizonMonths} inputmode="numeric"
            style="padding:6px 10px;border:1px solid var(--mep-divider,#e5e5e5);border-radius:6px;font-size:13px;width:100px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#888;">
          {$t('admin.rev.cacWindow')}
          <input name="cacWindowMonths" value={o.assumptions.cacWindowMonths} inputmode="numeric"
            style="padding:6px 10px;border:1px solid var(--mep-divider,#e5e5e5);border-radius:6px;font-size:13px;width:100px;" />
        </label>
        <button type="submit" style="padding:7px 14px;background:#111;color:#fff;border:0;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">
          {$t('admin.rev.saveAssumptions')}
        </button>
        <span style="font-size:11px;color:#aaa;flex:1;min-width:200px;">{$t('admin.rev.assumptionsHint')}</span>
      </form>
    </div>
    <div style="font-size:11px;color:#aaa;margin-top:8px;">
      {$t('admin.rev.priceBasis')}
      {#each o.priceByTier as price}
        <span style="margin-left:8px;" class="num">{price.tier}: {eur(price.monthlyCents)}</span>
      {/each}
    </div>
  </section>

  <section>
    <a href="/admin" style="font-size:13px;color:#555;text-decoration:none;">{$t('admin.backToOverview')}</a>
  </section>

</div>
