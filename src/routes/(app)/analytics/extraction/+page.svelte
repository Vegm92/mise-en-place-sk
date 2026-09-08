<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';

  let { data }: { data: PageData } = $props();

  function fmtPct(n: number | null | undefined) {
    if (n == null) return '—';
    return n.toFixed(1) + '%';
  }

  function fmtNum(n: number | null | undefined) {
    if (n == null) return '—';
    return n.toFixed(2);
  }

  const silentTotal = $derived(
    data.field_corrections.reduce((sum, r) => sum + r.silent_corrections, 0)
  );

  const maxCorrections = $derived(
    data.field_corrections.length ? data.field_corrections[0].corrections : 1
  );

  const maxTrendRate = $derived(
    data.trend.length
      ? Math.max(...data.trend.map(t => t.auto_confirmed_rate ?? 0), 1)
      : 100
  );
</script>

<div style="padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px;height:100%;overflow:auto;">

  <div style="display:flex;align-items:center;gap:8px;">
    <h2 class="m-0 text-[20px] font-semibold text-fg tracking-[-0.3px]">
      {t('extract.acc.title')}
    </h2>
    <span class="flex-1"></span>
    {#if data.hasData}
      <a href="/analytics/extraction/csv" data-sveltekit-reload class="btn btn-ghost"
        style="height:30px;font-size:13px;padding:0 10px;" title={t('extract.acc.exportHint')}>
        {t('extract.acc.exportCsv')}
      </a>
    {/if}
  </div>

  {#if !data.hasData}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 0;text-align:center;">
      <div style="font-size:36px;opacity:0.2;">🤖</div>
      <p class="text-[15px] font-medium text-fg-2 m-0">{t('extract.acc.noData')}</p>
      <p class="text-[13px] text-fg-4 max-w-[320px] m-0 leading-[1.5]">
        {t('extract.acc.noDataHint')}
      </p>
      <a href="/" class="text-[13px] text-acc no-underline inline-flex items-center min-h-[44px]">
        {t('spend.uploadFirst')}
      </a>
    </div>
  {:else}

    <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{t('extract.acc.autoRate')}</div>
        <div class="num text-[22px] font-semibold text-acc tracking-[-0.4px] leading-[1.1]">
          {fmtPct(data.kpis.auto_confirmed_rate)}
        </div>
        <div class="text-[11px] text-fg-3 mt-1">{t('extract.acc.noCorrections')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{t('extract.acc.totalProcessed')}</div>
        <div class="num text-[22px] font-semibold text-fg tracking-[-0.4px] leading-[1.1]">
          {data.kpis.total_invoices}
        </div>
        <div class="text-[11px] text-fg-3 mt-1">{t('extract.acc.historicalInv')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{t('extract.acc.avgCorrections')}</div>
        <div class="num text-[22px] font-semibold text-fg tracking-[-0.4px] leading-[1.1]">
          {fmtNum(data.kpis.avg_corrections)}
        </div>
        <div class="text-[11px] text-fg-3 mt-1">{t('extract.acc.perInvoice30d')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{t('extract.acc.mostAccurate')}</div>
        <div class="text-[14px] font-semibold text-fg tracking-[-0.2px] leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
          {data.kpis.most_accurate_supplier ?? '—'}
        </div>
        <div class="text-[11px] text-fg-3 mt-1">{t('extract.acc.lowestError')}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;" class="max-[900px]:grid-cols-1">

      <div class="card" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{t('extract.acc.mostCorrected')}</div>
        <div class="text-[12px] text-fg-3 mb-4">
          {t('extract.acc.mostCorrectedSub')}
        </div>
        {#if !data.field_corrections.length}
          <p class="text-[13px] text-fg-4 text-center py-6 m-0">{t('extract.acc.noCorrectionsRec')}</p>
        {:else}
          <table class="tbl-stack" style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead>
              <tr class="border-b border-divider">
                <th class="text-left pt-1 pr-2 pb-2 font-medium text-fg-3">{t('extract.acc.colField')}</th>
                <th class="num text-right pt-1 pb-2 font-medium text-fg-3">{t('extract.acc.colCorrections')}</th>
                <th class="num text-right pt-1 pb-2 pl-2 font-medium text-fg-3">{t('extract.acc.colPctInvoices')}</th>
                <th class="num text-right pt-1 pb-2 pl-2 font-medium text-fg-3" title={t('extract.acc.colFlaggedHint')}>{t('extract.acc.colFlagged')}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.field_corrections as row}
                <tr class="border-b border-divider">
                  <td class="tbl-stack-lead py-[7px] pr-2 text-fg">
                    <div class="w-full flex flex-col gap-1">
                      <span>{row.field_name}</span>
                      <div class="h-1 rounded-sm bg-surface-2 overflow-hidden">
                        <div class="h-full bg-warn rounded-sm" style="width:{Math.round(row.corrections / maxCorrections * 100)}%;"></div>
                      </div>
                    </div>
                  </td>
                  <td class="num py-[7px] text-right text-fg font-medium" data-label={t('extract.acc.colCorrections')}>{row.corrections}</td>
                  <td class="num py-[7px] pl-2 text-right text-fg-3" data-label={t('extract.acc.colPctInvoices')}>{fmtPct(row.invoice_pct)}</td>
                  <td class="num py-[7px] pl-2 text-right text-fg-3" data-label={t('extract.acc.colFlagged')}>
                    {#if row.flagged_corrections + row.silent_corrections === 0}
                      —
                    {:else}
                      <span class:text-warn={(row.flagged_pct ?? 0) < 50} class:text-fg-3={(row.flagged_pct ?? 0) >= 50}>{fmtPct(row.flagged_pct)}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if silentTotal > 0}
            <p class="mt-3 mb-0 text-[13px] text-fg-3 leading-[1.5]">
              {ti('extract.acc.silentNote', { count: silentTotal })}
            </p>
          {/if}
        {/if}
      </div>

      <div class="card" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{t('extract.acc.trend')}</div>
        <div class="text-[12px] text-fg-3 mb-4">
          {t('extract.acc.trendSub')}
        </div>
        {#if !data.trend.length}
          <p class="text-[13px] text-fg-4 text-center py-6 m-0">{t('extract.acc.noTrend')}</p>
        {:else}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each data.trend as point}
              <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span class="text-[12px] text-fg-2">{point.month}</span>
                  <span class="num text-[12px] font-medium text-fg">{fmtPct(point.auto_confirmed_rate)}</span>
                </div>
                <div class="h-2 rounded bg-surface-2 overflow-hidden">
                  <div class="h-full bg-acc rounded" style="width:{Math.round((point.auto_confirmed_rate ?? 0) / maxTrendRate * 100)}%;"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    </div>

    <div class="card" style="padding:16px;">
      <div class="subtitle" style="margin-bottom:4px;">{t('extract.acc.bySupplier')}</div>
      <div class="text-[12px] text-fg-3 mb-4">
        {t('extract.acc.bySupplierSub')}
      </div>
      {#if !data.supplier_accuracy.length}
        <p class="text-[13px] text-fg-4 text-center py-4 m-0">{t('extract.acc.noSupplierData')}</p>
      {:else}
        <table class="tbl-stack" style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead>
            <tr class="border-b border-divider">
              <th class="text-left pt-1 pb-2 font-medium text-fg-3">{t('extract.acc.colSupplier')}</th>
              <th class="num text-right pt-1 pb-2 px-2 font-medium text-fg-3">{t('extract.acc.colInvoices')}</th>
              <th class="num text-right pt-1 pb-2 px-2 font-medium text-fg-3">{t('extract.acc.colAutoConfirmed')}</th>
              <th class="num text-right pt-1 pb-2 font-medium text-fg-3">{t('extract.acc.colAvgCorr')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.supplier_accuracy as row}
              {@const lowAccuracy = (row.auto_confirmed_rate ?? 100) < 50}
              <tr class="border-b border-divider">
                <td class="tbl-stack-lead py-2">
                  <div class="flex items-center gap-1.5">
                    <span class="text-fg font-medium">{row.supplier_name}</span>
                    {#if lowAccuracy}
                      <span class="text-[11px] font-semibold py-px px-1.5 rounded-[10px] bg-warn-soft text-warn">{t('extract.acc.review')}</span>
                    {/if}
                  </div>
                </td>
                <td class="num p-2 text-right text-fg-3" data-label={t('extract.acc.colInvoices')}>{row.total_invoices}</td>
                <td class="p-2 text-right" data-label={t('extract.acc.colAutoConfirmed')}>
                  <span class="num font-semibold" class:text-warn={lowAccuracy} class:text-acc={!lowAccuracy}>{fmtPct(row.auto_confirmed_rate)}</span>
                </td>
                <td class="num py-2 text-right text-fg-3" data-label={t('extract.acc.colAvgCorr')}>{fmtNum(row.avg_corrections)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if data.supplier_accuracy.some(r => (r.auto_confirmed_rate ?? 100) < 50)}
          <p class="mt-3 mb-0 text-[12px] text-warn px-3 py-2 bg-warn-soft rounded-md">
            {t('extract.acc.reviewNote')}
          </p>
        {/if}
      {/if}
    </div>

  {/if}
</div>
