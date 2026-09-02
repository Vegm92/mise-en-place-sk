<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  import ExtractionPulsePanel from '$lib/components/admin/ExtractionPulsePanel.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  let { data }: { data: PageData } = $props();

  const pct = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(1)}%`;

  const confirmedByUser = $derived(
    data.aliasStats.find(s => s.source === 'user')?.total ?? 0
  );

  const maxTrend = $derived(Math.max(1, ...data.trend.map(p => p.corrections)));

  const SOURCE_LABEL: Record<string, string> = $derived({
    exact: $t('admin.learning.source.exact'),
    fuzzy: $t('admin.learning.source.fuzzy'),
    user:  $t('admin.learning.source.user'),
  });
</script>

<AdminPageHead route="/admin/learning" title={$t('admin.learning.title')} subtitle={$ti('admin.learning.subtitle', { days: data.summary.windowDays })} />

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  <ExtractionPulsePanel
    points={data.pulse}
    summary={data.summary}
    fuzzyOutcomes={data.fuzzyOutcomes}
    confirmedAliases={confirmedByUser}
  />

  <div class="hud-grid hud-grid-3">
    <HudPanel title={$t('admin.learning.byFieldTitle')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.learning.colField')}</th>
              <th scope="col" class="r">{$t('admin.learning.colCorrections')}</th>
              <th scope="col" class="r">{$t('admin.learning.colAvgConfidence')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.byField as row}
              <tr>
                <td class="mono">{row.fieldName}</td>
                <td class="num r">{row.corrections.toLocaleString('en-US')}</td>
                <td class="num r dim">{row.avgConfidence !== null ? row.avgConfidence.toFixed(2) : '—'}</td>
              </tr>
            {:else}
              <tr><td colspan="3" class="empty">{$t('admin.learning.empty')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>

    <HudPanel title={$t('admin.learning.bySupplierTitle')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.learning.colSupplier')}</th>
              <th scope="col" class="l">{$t('admin.colRestaurant')}</th>
              <th scope="col" class="r">{$t('admin.learning.colCorrections')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.bySupplier as row}
              <tr>
                <td>{row.supplierName ?? '—'}</td>
                <td class="dim">{row.restaurantName ?? '—'}</td>
                <td class="num r">{row.corrections.toLocaleString('en-US')}</td>
              </tr>
            {:else}
              <tr><td colspan="3" class="empty">{$t('admin.learning.empty')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>

    <HudPanel title={$t('admin.learning.byTenantTitle')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.colRestaurant')}</th>
              <th scope="col" class="r">{$t('admin.learning.colCorrections')}</th>
              <th scope="col" class="r">{$t('admin.learning.colInvoices')}</th>
              <th scope="col" class="r">{$t('admin.learning.colRate')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.byTenant as row}
              <tr>
                <td>{row.restaurantName}</td>
                <td class="num r">{row.corrections.toLocaleString('en-US')}</td>
                <td class="num r dim">{row.invoices.toLocaleString('en-US')}</td>
                <td class="num r" class:bad={row.rate !== null && row.rate > 0.5}>{pct(row.rate)}</td>
              </tr>
            {:else}
              <tr><td colspan="4" class="empty">{$t('admin.learning.empty')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>
  </div>

  <HudPanel title={$t('admin.learning.promptVersionTitle')} sub={$t('admin.learning.promptVersionSub')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{$t('admin.learning.colPromptVersion')}</th>
            <th scope="col" class="r">{$t('admin.learning.colDocuments')}</th>
            <th scope="col" class="r">{$t('admin.learning.colAvgConfidence')}</th>
            <th scope="col" class="r">{$t('admin.learning.colMismatches')}</th>
            <th scope="col" class="r">{$t('admin.learning.colInvoices')}</th>
            <th scope="col" class="r">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" class="r">{$t('admin.learning.colRate')}</th>
            <th scope="col" class="r">{$t('admin.dlq.colLastSeen')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.byPromptVersion as row (row.promptVersion)}
            <tr>
              <td class="mono">{row.promptVersion}</td>
              <td class="num r">{row.documents.toLocaleString('en-US')}</td>
              <td class="num r dim">{row.avgConfidence !== null ? row.avgConfidence.toFixed(2) : '—'}</td>
              <td class="num r" class:warn={row.totalMismatches > 0}>{row.totalMismatches.toLocaleString('en-US')}</td>
              <td class="num r dim">{row.invoices.toLocaleString('en-US')}</td>
              <td class="num r dim">{row.corrections.toLocaleString('en-US')}</td>
              <td class="num r" class:bad={row.correctionRate !== null && row.correctionRate > 0.5}>{pct(row.correctionRate)}</td>
              <td class="num r dim nowrap">{row.lastSeen ? new Date(row.lastSeen).toLocaleDateString('en-GB', { dateStyle: 'short' }) : '—'}</td>
            </tr>
          {:else}
            <tr><td colspan="8" class="empty">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <div class="hud-grid hud-grid-3">
    <HudPanel title={$t('admin.learning.trendTitle')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.learning.colWeek')}</th>
              <th scope="col" class="r">{$t('admin.learning.colCorrections')}</th>
              <th scope="col" class="l w45"></th>
            </tr>
          </thead>
          <tbody>
            {#each data.trend as point}
              <tr>
                <td class="num dim">{new Date(point.week).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
                <td class="num r">{point.corrections.toLocaleString('en-US')}</td>
                <td>
                  <div class="hud-bar-track" style="width:{Math.max(2, (point.corrections / maxTrend) * 100)}%;"></div>
                </td>
              </tr>
            {:else}
              <tr><td colspan="3" class="empty">{$t('admin.learning.empty')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>

    <HudPanel title={$t('admin.learning.matchingTitle')} sub={$t('admin.learning.matchingSubtitle')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.learning.colSource')}</th>
              <th scope="col" class="r">{$t('admin.learning.colTotal')}</th>
              <th scope="col" class="r">{$t('admin.learning.colPending')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.aliasStats as row}
              <tr>
                <td>{SOURCE_LABEL[row.source] ?? row.source}</td>
                <td class="num r">{row.total.toLocaleString('en-US')}</td>
                <td class="num r" class:warn={row.pending > 0}>{row.pending.toLocaleString('en-US')}</td>
              </tr>
            {:else}
              <tr><td colspan="3" class="empty">{$t('admin.learning.empty')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>

    <HudPanel title={$t('admin.learning.fuzzyOutcomesTitle')} sub={$t('admin.learning.fuzzyOutcomesSub')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="r">{$t('admin.learning.colTotal')}</th>
              <th scope="col" class="r">{$t('admin.learning.colConfirmed')}</th>
              <th scope="col" class="r">{$t('admin.learning.colRejected')}</th>
              <th scope="col" class="r">{$t('admin.learning.colAccuracy')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="num r">{data.fuzzyOutcomes.total.toLocaleString('en-US')}</td>
              <td class="num r good">{data.fuzzyOutcomes.confirmed.toLocaleString('en-US')}</td>
              <td class="num r bad">{data.fuzzyOutcomes.rejected.toLocaleString('en-US')}</td>
              <td class="num r">{pct(data.fuzzyOutcomes.accuracyRate)}</td>
            </tr>
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>
  </div>

  {#if data.pendingFuzzy.length > 0}
    <HudPanel title={$t('admin.learning.pendingFuzzyTitle')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.colRestaurant')}</th>
              <th scope="col" class="l">{$t('admin.learning.colProduct')}</th>
              <th scope="col" class="l">{$t('admin.learning.colRawText')}</th>
              <th scope="col" class="r">{$t('admin.learning.colCreated')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.pendingFuzzy as row (row.id)}
              <tr>
                <td class="dim">{row.restaurantName ?? '—'}</td>
                <td>{row.productName}</td>
                <td class="dim">{row.rawText ?? '—'}</td>
                <td class="num r dim nowrap">{new Date(row.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>
  {/if}

  <a href="/admin" class="text-[13px] text-acc no-underline">{$t('admin.backToOverview')}</a>

</div>

<style>
  .hud-grid {
    display: grid;
    gap: 10px;
  }
  .hud-grid-3 {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  :global(.hud-table) {
    width: 100%;
    border-collapse: collapse;
    font: 500 11.5px/1.3 ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }
  :global(.hud-table thead tr) {
    background: rgba(255, 255, 255, 0.03);
  }
  :global(.hud-table th) {
    padding: 6px 10px;
    font: 600 9px/1 ui-monospace, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5b6472;
    text-align: left;
    white-space: nowrap;
  }
  :global(.hud-table th.r) { text-align: right; }
  :global(.hud-table th.w45) { width: 45%; }
  :global(.hud-table td) {
    padding: 5px 10px;
    color: #e7edf5;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  :global(.hud-table td.r) { text-align: right; }
  :global(.hud-table td.mono) { font-family: ui-monospace, monospace; }
  :global(.hud-table td.dim) { color: #5b6472; }
  :global(.hud-table td.nowrap) { white-space: nowrap; }
  :global(.hud-table td.good) { color: #34d399; }
  :global(.hud-table td.warn) { color: #fbbf24; }
  :global(.hud-table td.bad) { color: #f87171; }
  :global(.hud-table td.empty) {
    text-align: center;
    color: #5b6472;
    padding: 14px 10px;
  }

  :global(.hud-bar-track) {
    height: 6px;
    border-radius: 2px;
    background: #38bdf8;
    opacity: 0.6;
  }
</style>
