<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/stores';
  import { t, ti, tiv, tcat } from '$lib/i18n';
  import { REPORT_STYLES, cellKind, cellText, cellTone, type Cell, type Label } from '$lib/reports';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Printer from '@lucide/svelte/icons/printer';
  import Download from '@lucide/svelte/icons/download';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';

  let { data }: { data: PageData } = $props();

  const doc = $derived(data.doc);

  function label(value: Label): string {
    return typeof value === 'string' ? $t(value) : $tiv(value.key, value.vars);
  }

  function text(cell: Cell): string {
    const kind = cellKind(cell);
    if (kind === 'cat') return $tcat(cellText(cell));
    if (kind === 'key') return $t(cellText(cell));
    return cellText(cell);
  }

  function toneColor(cell: Cell): string {
    const tone = cellTone(cell);
    if (tone === 'up') return 'var(--mep-neg)';
    if (tone === 'down') return 'var(--mep-pos)';
    if (tone === 'warn') return 'var(--mep-warn)';
    if (tone === 'muted') return 'var(--mep-fg-3)';
    return 'inherit';
  }

  function kpiColor(tone: string | null): string {
    if (tone === 'up') return 'var(--mep-neg)';
    if (tone === 'down') return 'var(--mep-pos)';
    if (tone === 'warn') return 'var(--mep-warn)';
    return 'var(--mep-fg-3)';
  }

  function href(params: Record<string, string>): string {
    const next = new URLSearchParams($page.url.searchParams);
    for (const [k, v] of Object.entries(params)) next.set(k, v);
    return `?${next.toString()}`;
  }

  const csvHref = $derived(`/reports/${doc.type}/csv${$page.url.search}`);
</script>

<svelte:head>
  <style>
    @page { size: A4; margin: 12mm; }
    @media print {
      .app-header, aside, .report-toolbar { display: none !important; }
      main { overflow: visible !important; }
      .report-sheet { border: none !important; box-shadow: none !important; margin: 0 !important; width: auto !important; }
    }
  </style>
</svelte:head>

<div style="max-width:860px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-direction:column;gap:16px;">

  <div class="report-toolbar" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
    <a href="/reports" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--mep-fg-3);">
      <ArrowLeft size={14} />
      {$t('rep.back')}
    </a>
    <div style="flex:1;"></div>
    <button type="button" onclick={() => window.print()} class="rep-action">
      <Printer size={14} />
      {$t('rep.printPdf')}
    </button>
    <a href={csvHref} class="rep-action" data-sveltekit-reload>
      <Download size={14} />
      {$t('rep.downloadCsv')}
    </a>
  </div>

  <div class="report-toolbar" style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;">
    <div style="display:flex;gap:6px;align-items:center;">
      <span style="font-size:11px;color:var(--mep-fg-3);">{$t('rep.section.style')}</span>
      {#each REPORT_STYLES as style (style)}
        <a href={href({ style })} class="rep-pill" data-on={data.style === style}>{$t(`rep.style.${style}`)}</a>
      {/each}
    </div>
    {#if data.periods.length > 1}
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:11px;color:var(--mep-fg-3);">{$t('rep.section.period')}</span>
        {#each data.periods as period (period)}
          <a href={href({ period })} class="rep-pill" data-on={doc.periodIso === period}>{period}</a>
        {/each}
      </div>
    {/if}
  </div>

  <div class="report-sheet" data-rstyle={data.style}>

    <div class="rep-head">
      <div style="display:flex;flex-direction:column;gap:1px;">
        <span class="rep-brand">Mise en Place</span>
        <span class="rep-muted">{$t('rep.internalDoc')}</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <span class="rep-eyebrow">{$t(doc.eyebrow)}</span>
        <span class="rep-muted">{$ti('rep.generatedAt', { at: doc.generatedAt })}</span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:4px;">
      <h1 class="rep-title">{$t(doc.heading)}</h1>
      <p class="rep-sub">{label(doc.subheading)}</p>
    </div>

    {#if doc.empty}
      <p class="rep-empty">{$t('rep.empty')}</p>
    {:else}

      <div class="rep-kpis">
        {#each doc.kpis as kpi (kpi.label)}
          <div class="rep-kpi" data-warn={kpi.tone === 'warn'}>
            <span class="rep-kpi-label">{$t(kpi.label)}</span>
            <span class="rep-kpi-value num">{kpi.value}</span>
            {#if kpi.note}
              <span class="rep-kpi-note num" style="color:{kpiColor(kpi.tone)};">{label(kpi.note)}</span>
            {/if}
          </div>
        {/each}
      </div>

      {#if doc.summary}
        <div class="rep-summary">
          <span class="rep-eyebrow">{$t('rep.summary')}</span>
          <p class="rep-summary-text">{doc.summary}</p>
        </div>
      {/if}

      {#if doc.bars.length}
        <div class="rep-chart-block">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;">
            <h2 class="rep-h2">{$t(doc.chartTitle ?? '')}</h2>
            {#if doc.chartNote}<span class="rep-muted">{$t(doc.chartNote)}</span>{/if}
          </div>
          <div class="rep-chart">
            {#each doc.bars as bar (label(bar.label))}
              <div class="rep-bar-col">
                <span class="rep-bar-val num">{bar.value}</span>
                <span class="rep-bar" style="height:{Math.max(bar.pct, 1)}%;background:{bar.color};"></span>
              </div>
            {/each}
          </div>
          <div style="display:flex;gap:10px;">
            {#each doc.bars as bar (label(bar.label))}
              <span class="rep-bar-lbl" data-muted={bar.muted}>{label(bar.label)}</span>
            {/each}
          </div>
        </div>
      {/if}

      <div style="display:flex;flex-direction:column;gap:9px;">
        <h2 class="rep-h2">{$t(doc.tableTitle)}</h2>
        <ScrollStrip padding="0" leadIn="0" gap="0" label={$t(doc.tableTitle)}>
        <table class="rep-table">
          <thead>
            <tr>
              {#each doc.columns as col (col.key)}
                <th class:n={col.numeric}>{$t(col.label)}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each doc.rows as row, i (i)}
              <tr>
                {#each doc.columns as col (col.key)}
                  <td class:n={col.numeric} style="color:{toneColor(row[col.key] ?? '')};">
                    {text(row[col.key] ?? '')}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
          {#if doc.total}
            <tfoot>
              <tr>
                {#each doc.columns as col (col.key)}
                  <td class:n={col.numeric}>{text(doc.total[col.key] ?? '')}</td>
                {/each}
              </tr>
            </tfoot>
          {/if}
        </table>
        </ScrollStrip>
      </div>

    {/if}

    <div class="rep-foot">
      <span>{$t('rep.internalDoc')}</span>
      <span class="num">{doc.periodIso}</span>
    </div>

  </div>
</div>

<style>
  .num { font-variant-numeric: tabular-nums; }

  .rep-action {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px; padding: 6px 12px; border-radius: 8px;
    border: 1px solid var(--mep-border); background: var(--mep-surface);
    color: var(--mep-fg); cursor: pointer; text-decoration: none;
  }
  .rep-action:hover { border-color: var(--mep-acc); color: var(--mep-acc); }

  .rep-pill {
    font-size: 12px; padding: 4px 10px; border-radius: 999px;
    border: 1px solid var(--mep-border); color: var(--mep-fg-3);
    text-decoration: none; white-space: nowrap;
  }
  .rep-pill[data-on='true'] {
    border-color: var(--mep-acc); color: var(--mep-acc); background: var(--mep-acc-soft);
  }

  .report-sheet {
    background: var(--mep-surface);
    border: 1px solid var(--mep-border);
    border-radius: 10px;
    padding: 34px 40px 26px;
    display: flex; flex-direction: column; gap: 14px;
    color: var(--mep-fg);
  }

  .rep-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 24px; padding-bottom: 12px; border-bottom: 2px solid var(--mep-acc);
  }
  .rep-brand { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
  .rep-muted { font-size: 12px; color: var(--mep-fg-3); }
  .rep-eyebrow {
    font-size: 12px; font-weight: 500; letter-spacing: 0.04em;
    text-transform: uppercase; color: var(--mep-acc);
  }

  .rep-title { font-size: 27px; font-weight: 600; letter-spacing: -0.02em; margin: 0; line-height: 1.15; }
  .rep-sub { font-size: 15px; color: var(--mep-fg-2); margin: 0; }
  .rep-h2 { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
  .rep-empty { font-size: 14px; color: var(--mep-fg-3); margin: 24px 0; text-align: center; }

  .rep-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .rep-kpi {
    border: 1px solid var(--mep-border); border-radius: 10px; padding: 12px 11px;
    display: flex; flex-direction: column; gap: 5px; min-width: 0;
  }
  .rep-kpi[data-warn='true'] { border-color: var(--mep-warn); background: var(--mep-warn-soft); }
  .rep-kpi-label {
    font-size: 11px; font-weight: 500; letter-spacing: 0.04em;
    text-transform: uppercase; color: var(--mep-fg-3);
  }
  .rep-kpi-value { font-size: 21px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.15; }
  .rep-kpi-note { font-size: 13px; font-weight: 500; }

  .rep-summary {
    background: var(--mep-bg); border-left: 3px solid var(--mep-acc);
    border-radius: 0 10px 10px 0; padding: 14px 18px;
    display: flex; flex-direction: column; gap: 7px;
  }
  .rep-summary-text { font-size: 15px; line-height: 1.6; margin: 0; white-space: pre-wrap; color: var(--mep-fg); }

  .rep-chart-block { display: flex; flex-direction: column; gap: 10px; }

  .rep-chart {
    display: flex; align-items: flex-end; gap: 10px; height: 128px;
    padding-bottom: 2px; border-bottom: 1px solid var(--mep-border);
  }
  .rep-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 5px; min-width: 0; height: 100%; }
  .rep-bar-val { font-size: 11px; color: var(--mep-fg-2); white-space: nowrap; }
  .rep-bar { width: 100%; border-radius: 3px 3px 0 0; display: block; }
  .rep-bar-lbl {
    flex: 1; text-align: center; font-size: 12px; color: var(--mep-fg-3);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
  }
  .rep-bar-lbl[data-muted='true'] { opacity: 0.7; }

  .rep-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; }
  .rep-table th {
    font-size: 11px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--mep-fg-3); text-align: left; padding: 0 10px 8px; white-space: nowrap;
    border-bottom: 1px solid var(--mep-border);
  }
  .rep-table td {
    font-size: 15px; padding: 0 10px; height: 31px;
    border-bottom: 1px solid var(--mep-border); vertical-align: middle;
  }
  .rep-table th.n, .rep-table td.n { text-align: right; font-variant-numeric: tabular-nums; }
  .rep-table tfoot td { font-weight: 600; border-bottom: none; border-top: 2px solid var(--mep-border); }

  .rep-foot {
    display: flex; justify-content: space-between; font-size: 11px;
    color: var(--mep-fg-3); padding-top: 10px; border-top: 1px solid var(--mep-border);
  }

  .report-sheet[data-rstyle='accounting'] .rep-head { border-bottom-color: var(--mep-fg); }
  .report-sheet[data-rstyle='accounting'] .rep-eyebrow { color: var(--mep-fg-2); }
  .report-sheet[data-rstyle='accounting'] .rep-title { font-size: 20px; letter-spacing: 0; }
  .report-sheet[data-rstyle='accounting'] .rep-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border: 1px solid var(--mep-border); }
  .report-sheet[data-rstyle='accounting'] .rep-kpi { border: none; border-right: 1px solid var(--mep-border); border-radius: 0; }
  .report-sheet[data-rstyle='accounting'] .rep-kpi-value { font-size: 17px; }
  .report-sheet[data-rstyle='accounting'] .rep-summary { border-left-color: var(--mep-fg-3); }
  .report-sheet[data-rstyle='accounting'] .rep-table td { height: 26px; font-size: 13px; font-variant-numeric: tabular-nums; }
  .report-sheet[data-rstyle='accounting'] .rep-chart-block { display: none; }

  .report-sheet[data-rstyle='editorial'] .rep-title { font-size: 38px; font-weight: 700; letter-spacing: -0.03em; }
  .report-sheet[data-rstyle='editorial'] .rep-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .report-sheet[data-rstyle='editorial'] .rep-kpi { border: none; border-left: 3px solid var(--mep-acc); border-radius: 0; padding-left: 12px; }
  .report-sheet[data-rstyle='editorial'] .rep-kpi-value { font-size: 30px; }
  .report-sheet[data-rstyle='editorial'] .rep-summary-text { font-size: 19px; line-height: 1.5; }
  .report-sheet[data-rstyle='editorial'] .rep-table td { font-size: 16px; height: 36px; }

  @media (max-width: 720px) {
    .report-sheet { padding: 20px 16px 18px; }
    .rep-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rep-title { font-size: 22px; }
    .report-sheet[data-rstyle='editorial'] .rep-title { font-size: 26px; }
  }
</style>
