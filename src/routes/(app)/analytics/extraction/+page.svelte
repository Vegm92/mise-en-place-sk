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
    data.field_corrections.length ? data.field_corrections[0]!.corrections : 1
  );

  const maxTrendRate = $derived(
    data.trend.length
      ? Math.max(...data.trend.map(t => t.auto_confirmed_rate ?? 0), 1)
      : 100
  );
</script>

<div class="px-6 pt-5 pb-6 flex flex-col gap-[14px] h-full overflow-auto">

  <div class="flex items-center gap-2">
    <h2 class="m-0 text-[20px] font-semibold text-fg tracking-[-0.3px]">
      {t('extract.acc.title')}
    </h2>
    <span class="flex-1"></span>
    {#if data.hasData}
      <a href="/analytics/extraction/csv" data-sveltekit-reload class="btn btn-ghost h-[30px] text-[13px] px-[10px]" title={t('extract.acc.exportHint')}>
        {t('extract.acc.exportCsv')}
      </a>
    {/if}
  </div>

  {#if !data.hasData}
    <div class="flex-1 flex flex-col items-center justify-center gap-[10px] py-12 text-center">
      <div class="text-[36px] opacity-20">🤖</div>
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
      <div class="card p-[14px]">
        <div class="label mb-[6px]">{t('extract.acc.autoRate')}</div>
        <div class="num text-[22px] font-semibold text-acc tracking-[-0.4px] leading-[1.1]">
          {fmtPct(data.kpis.auto_confirmed_rate)}
        </div>
        <div class="text-[11px] text-fg-3 mt-1">{t('extract.acc.noCorrections')}</div>
      </div>
      <div class="card p-[14px]">
        <div class="label mb-[6px]">{t('extract.acc.totalProcessed')}</div>
        <div class="num text-[22px] font-semibold text-fg tracking-[-0.4px] leading-[1.1]">
          {data.kpis.total_invoices}
        </div>
        <div class="text-[11px] text-fg-3 mt-1">{t('extract.acc.historicalInv')}</div>
      </div>
      <div class="card p-[14px]">
        <div class="label mb-[6px]">{t('extract.acc.avgCorrections')}</div>
        <div class="num text-[22px] font-semibold text-fg tracking-[-0.4px] leading-[1.1]">
          {fmtNum(data.kpis.avg_corrections)}
        </div>
        <div class="text-[11px] text-fg-3 mt-1">{t('extract.acc.perInvoice30d')}</div>
      </div>
      <div class="card p-[14px]">
        <div class="label mb-[6px]">{t('extract.acc.mostAccurate')}</div>
        <div class="text-[14px] font-semibold text-fg tracking-[-0.2px] leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
          {data.kpis.most_accurate_supplier ?? '—'}
        </div>
        <div class="text-[11px] text-fg-3 mt-1">{t('extract.acc.lowestError')}</div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">

      <div class="card p-4">
        <div class="subtitle mb-1">{t('extract.acc.mostCorrected')}</div>
        <div class="text-[12px] text-fg-3 mb-4">
          {t('extract.acc.mostCorrectedSub')}
        </div>
        {#if !data.field_corrections.length}
          <p class="text-[13px] text-fg-4 text-center py-6">{t('extract.acc.noCorrectionsRec')}</p>
        {:else}
          <table class="tbl-stack w-full border-collapse text-[12.5px]">
            <thead>
              <tr class="border-b border-divider">
                <th class="text-left py-1 pr-2 pb-2 font-medium text-fg-3">{t('extract.acc.colField')}</th>
                <th class="num text-right py-1 pb-2 font-medium text-fg-3">{t('extract.acc.colCorrections')}</th>
                <th class="num text-right py-1 pb-2 pl-2 font-medium text-fg-3">{t('extract.acc.colPctInvoices')}</th>
                <th class="num text-right py-1 pb-2 pl-2 font-medium text-fg-3" title={t('extract.acc.colFlaggedHint')}>{t('extract.acc.colFlagged')}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.field_corrections as row}
                <tr class="border-b border-divider">
                  <td class="tbl-stack-lead py-[7px] pr-2 text-fg">
                    <div class="w-full flex flex-col gap-1">
                      <span>{row.field_name}</span>
                      <div class="h-1 rounded-[2px] bg-surface-2 overflow-hidden">
                        <div class="h-full bg-warn rounded-[2px]" style="width:{Math.round(row.corrections / maxCorrections * 100)}%;"></div>
                      </div>
                    </div>
                  </td>
                  <td class="num text-right py-[7px] text-fg font-medium" data-label={t('extract.acc.colCorrections')}>{row.corrections}</td>
                  <td class="num text-right py-[7px] pl-2 text-fg-3" data-label={t('extract.acc.colPctInvoices')}>{fmtPct(row.invoice_pct)}</td>
                  <td class="num text-right py-[7px] pl-2 text-fg-3" data-label={t('extract.acc.colFlagged')}>
                    {#if row.flagged_corrections + row.silent_corrections === 0}
                      —
                    {:else}
                      <span class={(row.flagged_pct ?? 0) < 50 ? 'text-warn' : 'text-fg-3'}>{fmtPct(row.flagged_pct)}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if silentTotal > 0}
            <p class="mt-3 text-[13px] text-fg-3 leading-[1.5]">
              {ti('extract.acc.silentNote', { count: silentTotal })}
            </p>
          {/if}
        {/if}
      </div>

      <div class="card p-4">
        <div class="subtitle mb-1">{t('extract.acc.trend')}</div>
        <div class="text-[12px] text-fg-3 mb-4">
          {t('extract.acc.trendSub')}
        </div>
        {#if !data.trend.length}
          <p class="text-[13px] text-fg-4 text-center py-6">{t('extract.acc.noTrend')}</p>
        {:else}
          <div class="flex flex-col gap-[10px]">
            {#each data.trend as point}
              <div>
                <div class="flex justify-between mb-1">
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

    <div class="card p-4">
      <div class="subtitle mb-1">{t('extract.acc.bySupplier')}</div>
      <div class="text-[12px] text-fg-3 mb-4">
        {t('extract.acc.bySupplierSub')}
      </div>
      {#if !data.supplier_accuracy.length}
        <p class="text-[13px] text-fg-4 text-center py-4">{t('extract.acc.noSupplierData')}</p>
      {:else}
        <table class="tbl-stack w-full border-collapse text-[12.5px]">
          <thead>
            <tr class="border-b border-divider">
              <th class="text-left py-1 pb-2 font-medium text-fg-3">{t('extract.acc.colSupplier')}</th>
              <th class="num text-right py-1 px-2 pb-2 font-medium text-fg-3">{t('extract.acc.colInvoices')}</th>
              <th class="num text-right py-1 px-2 pb-2 font-medium text-fg-3">{t('extract.acc.colAutoConfirmed')}</th>
              <th class="num text-right py-1 pb-2 font-medium text-fg-3">{t('extract.acc.colAvgCorr')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.supplier_accuracy as row}
              {@const lowAccuracy = (row.auto_confirmed_rate ?? 100) < 50}
              <tr class="border-b border-divider">
                <td class="tbl-stack-lead py-2">
                  <div class="flex items-center gap-[6px]">
                    <span class="text-fg font-medium">{row.supplier_name}</span>
                    {#if lowAccuracy}
                      <span class="text-[11px] font-semibold py-px px-[6px] rounded-[10px] bg-warn-soft text-warn">{t('extract.acc.review')}</span>
                    {/if}
                  </div>
                </td>
                <td class="num text-right p-2 text-fg-3" data-label={t('extract.acc.colInvoices')}>{row.total_invoices}</td>
                <td class="text-right p-2" data-label={t('extract.acc.colAutoConfirmed')}>
                  <span class="num font-semibold {lowAccuracy ? 'text-warn' : 'text-acc'}">{fmtPct(row.auto_confirmed_rate)}</span>
                </td>
                <td class="num text-right py-2 text-fg-3" data-label={t('extract.acc.colAvgCorr')}>{fmtNum(row.avg_corrections)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if data.supplier_accuracy.some(r => (r.auto_confirmed_rate ?? 100) < 50)}
          <p class="mt-3 text-[12px] text-warn py-2 px-3 bg-warn-soft rounded-[6px]">
            {t('extract.acc.reviewNote')}
          </p>
        {/if}
      {/if}
    </div>

  {/if}
</div>
