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
    <h2 style="margin:0;font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">
      {$t('extract.acc.title')}
    </h2>
    <span style="flex:1;"></span>
    {#if data.hasData}
      <a href="/analytics/extraction/csv" data-sveltekit-reload class="btn btn-ghost"
        style="height:30px;font-size:13px;padding:0 10px;" title={$t('extract.acc.exportHint')}>
        {$t('extract.acc.exportCsv')}
      </a>
    {/if}
  </div>

  {#if !data.hasData}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 0;text-align:center;">
      <div style="font-size:36px;opacity:0.2;">🤖</div>
      <p style="font-size:15px;font-weight:500;color:var(--mep-fg-2);margin:0;">{$t('extract.acc.noData')}</p>
      <p style="font-size:13px;color:var(--mep-fg-4);max-width:320px;margin:0;line-height:1.5;">
        {$t('extract.acc.noDataHint')}
      </p>
      <a href="/" style="font-size:13px;color:var(--mep-acc);text-decoration:none;display:inline-flex;align-items:center;min-height:44px;">
        {$t('spend.uploadFirst')}
      </a>
    </div>
  {:else}

    <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('extract.acc.autoRate')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-acc);letter-spacing:-0.4px;line-height:1.1;">
          {fmtPct(data.kpis.auto_confirmed_rate)}
        </div>
        <div style="font-size:11px;color:var(--mep-fg-3);margin-top:4px;">{$t('extract.acc.noCorrections')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('extract.acc.totalProcessed')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">
          {data.kpis.total_invoices}
        </div>
        <div style="font-size:11px;color:var(--mep-fg-3);margin-top:4px;">{$t('extract.acc.historicalInv')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('extract.acc.avgCorrections')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">
          {fmtNum(data.kpis.avg_corrections)}
        </div>
        <div style="font-size:11px;color:var(--mep-fg-3);margin-top:4px;">{$t('extract.acc.perInvoice30d')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('extract.acc.mostAccurate')}</div>
        <div style="font-size:14px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.2px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          {data.kpis.most_accurate_supplier ?? '—'}
        </div>
        <div style="font-size:11px;color:var(--mep-fg-3);margin-top:4px;">{$t('extract.acc.lowestError')}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;" class="max-[900px]:grid-cols-1">

      <div class="card" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{$t('extract.acc.mostCorrected')}</div>
        <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">
          {$t('extract.acc.mostCorrectedSub')}
        </div>
        {#if !data.field_corrections.length}
          <p style="font-size:13px;color:var(--mep-fg-4);text-align:center;padding:24px 0;">{$t('extract.acc.noCorrectionsRec')}</p>
        {:else}
          <table class="tbl-stack" style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead>
              <tr style="border-bottom:1px solid var(--mep-divider);">
                <th style="text-align:left;padding:4px 8px 8px 0;font-weight:500;color:var(--mep-fg-3);">{$t('extract.acc.colField')}</th>
                <th style="text-align:right;padding:4px 0 8px;font-weight:500;color:var(--mep-fg-3);" class="num">{$t('extract.acc.colCorrections')}</th>
                <th style="text-align:right;padding:4px 0 8px 8px;font-weight:500;color:var(--mep-fg-3);" class="num">{$t('extract.acc.colPctInvoices')}</th>
                <th style="text-align:right;padding:4px 0 8px 8px;font-weight:500;color:var(--mep-fg-3);" class="num" title={$t('extract.acc.colFlaggedHint')}>{$t('extract.acc.colFlagged')}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.field_corrections as row}
                <tr style="border-bottom:1px solid var(--mep-divider);">
                  <td class="tbl-stack-lead" style="padding:7px 8px 7px 0;color:var(--mep-fg);">
                    <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
                      <span>{row.field_name}</span>
                      <div style="height:4px;border-radius:2px;background:var(--mep-surface-2);overflow:hidden;">
                        <div style="width:{Math.round(row.corrections / maxCorrections * 100)}%;height:100%;background:var(--mep-warn);border-radius:2px;"></div>
                      </div>
                    </div>
                  </td>
                  <td class="num" data-label={$t('extract.acc.colCorrections')} style="padding:7px 0;text-align:right;color:var(--mep-fg);font-weight:500;">{row.corrections}</td>
                  <td class="num" data-label={$t('extract.acc.colPctInvoices')} style="padding:7px 0 7px 8px;text-align:right;color:var(--mep-fg-3);">{fmtPct(row.invoice_pct)}</td>
                  <td class="num" data-label={$t('extract.acc.colFlagged')} style="padding:7px 0 7px 8px;text-align:right;color:var(--mep-fg-3);">
                    {#if row.flagged_corrections + row.silent_corrections === 0}
                      —
                    {:else}
                      <span style="color:{(row.flagged_pct ?? 0) < 50 ? 'var(--mep-warn)' : 'var(--mep-fg-3)'};">{fmtPct(row.flagged_pct)}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if silentTotal > 0}
            <p style="margin:12px 0 0;font-size:13px;color:var(--mep-fg-3);line-height:1.5;">
              {$ti('extract.acc.silentNote', { count: silentTotal })}
            </p>
          {/if}
        {/if}
      </div>

      <div class="card" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{$t('extract.acc.trend')}</div>
        <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">
          {$t('extract.acc.trendSub')}
        </div>
        {#if !data.trend.length}
          <p style="font-size:13px;color:var(--mep-fg-4);text-align:center;padding:24px 0;">{$t('extract.acc.noTrend')}</p>
        {:else}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each data.trend as point}
              <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-size:12px;color:var(--mep-fg-2);">{point.month}</span>
                  <span class="num" style="font-size:12px;font-weight:500;color:var(--mep-fg);">{fmtPct(point.auto_confirmed_rate)}</span>
                </div>
                <div style="height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:hidden;">
                  <div style="
                    width:{Math.round((point.auto_confirmed_rate ?? 0) / maxTrendRate * 100)}%;
                    height:100%;
                    background:var(--mep-acc);
                    border-radius:4px;
                  "></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    </div>

    <div class="card" style="padding:16px;">
      <div class="subtitle" style="margin-bottom:4px;">{$t('extract.acc.bySupplier')}</div>
      <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">
        {$t('extract.acc.bySupplierSub')}
      </div>
      {#if !data.supplier_accuracy.length}
        <p style="font-size:13px;color:var(--mep-fg-4);text-align:center;padding:16px 0;">{$t('extract.acc.noSupplierData')}</p>
      {:else}
        <table class="tbl-stack" style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead>
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <th style="text-align:left;padding:4px 0 8px;font-weight:500;color:var(--mep-fg-3);">{$t('extract.acc.colSupplier')}</th>
              <th style="text-align:right;padding:4px 8px 8px;font-weight:500;color:var(--mep-fg-3);" class="num">{$t('extract.acc.colInvoices')}</th>
              <th style="text-align:right;padding:4px 8px 8px;font-weight:500;color:var(--mep-fg-3);" class="num">{$t('extract.acc.colAutoConfirmed')}</th>
              <th style="text-align:right;padding:4px 0 8px;font-weight:500;color:var(--mep-fg-3);" class="num">{$t('extract.acc.colAvgCorr')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.supplier_accuracy as row}
              {@const lowAccuracy = (row.auto_confirmed_rate ?? 100) < 50}
              <tr style="border-bottom:1px solid var(--mep-divider);">
                <td class="tbl-stack-lead" style="padding:8px 0;">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="color:var(--mep-fg);font-weight:500;">{row.supplier_name}</span>
                    {#if lowAccuracy}
                      <span style="
                        font-size:11px;font-weight:600;padding:1px 6px;border-radius:10px;
                        background:var(--mep-warn-soft);color:var(--mep-warn);
                      ">{$t('extract.acc.review')}</span>
                    {/if}
                  </div>
                </td>
                <td class="num" data-label={$t('extract.acc.colInvoices')} style="padding:8px;text-align:right;color:var(--mep-fg-3);">{row.total_invoices}</td>
                <td data-label={$t('extract.acc.colAutoConfirmed')} style="padding:8px;text-align:right;">
                  <span class="num" style="
                    font-weight:600;
                    color:{lowAccuracy ? 'var(--mep-warn)' : 'var(--mep-acc)'};
                  ">{fmtPct(row.auto_confirmed_rate)}</span>
                </td>
                <td class="num" data-label={$t('extract.acc.colAvgCorr')} style="padding:8px 0;text-align:right;color:var(--mep-fg-3);">{fmtNum(row.avg_corrections)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if data.supplier_accuracy.some(r => (r.auto_confirmed_rate ?? 100) < 50)}
          <p style="margin:12px 0 0;font-size:12px;color:var(--mep-warn);padding:8px 12px;background:var(--mep-warn-soft);border-radius:6px;">
            {$t('extract.acc.reviewNote')}
          </p>
        {/if}
      {/if}
    </div>

  {/if}
</div>
