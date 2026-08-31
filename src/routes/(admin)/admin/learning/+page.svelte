<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminKpiCard from '$lib/components/admin/AdminKpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
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

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:16px;">

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
    <AdminKpiCard
      label={$t('admin.learning.kpiCorrections')}
      value={data.summary.totalCorrections.toLocaleString('en-US')}
      sub={$ti('admin.learning.kpiCorrectionsSub', { days: data.summary.windowDays })}
    />
    <AdminKpiCard
      label={$t('admin.learning.kpiRate')}
      value={pct(data.summary.correctionRate)}
      sub={$t('admin.learning.kpiRateSub')}
    />
    <AdminKpiCard
      label={$t('admin.learning.kpiPendingFuzzy')}
      value={data.fuzzyOutcomes.pending.toLocaleString('en-US')}
      valueColor={data.fuzzyOutcomes.pending > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'}
      sub={$t('admin.learning.kpiPendingFuzzySub')}
    />
    <AdminKpiCard
      label={$t('admin.learning.kpiAccuracy')}
      value={pct(data.fuzzyOutcomes.accuracyRate)}
      sub={$t('admin.learning.kpiAccuracySub')}
    />
    <AdminKpiCard
      label={$t('admin.learning.kpiConfirmedAliases')}
      value={confirmedByUser.toLocaleString('en-US')}
      sub={$t('admin.learning.kpiConfirmedAliasesSub')}
    />
  </div>

  <SectionCard title={$t('admin.learning.byFieldTitle')} sub={$t('admin.learning.byFieldSub')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colField')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colAvgConfidence')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.byField as row}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg);font-family:var(--mep-fs-mono);">{row.fieldName}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{row.corrections.toLocaleString('en-US')}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);">{row.avgConfidence !== null ? row.avgConfidence.toFixed(2) : '—'}</td>
            </tr>
          {:else}
            <tr><td colspan="3" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.bySupplierTitle')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colSupplier')}</th>
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colRestaurant')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colCorrections')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.bySupplier as row}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg);">{row.supplierName ?? '—'}</td>
              <td style="padding:9px 16px;color:var(--mep-fg-2);">{row.restaurantName ?? '—'}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{row.corrections.toLocaleString('en-US')}</td>
            </tr>
          {:else}
            <tr><td colspan="3" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.byTenantTitle')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colRestaurant')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colInvoices')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colRate')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.byTenant as row}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg);">{row.restaurantName}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{row.corrections.toLocaleString('en-US')}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);">{row.invoices.toLocaleString('en-US')}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:{row.rate !== null && row.rate > 0.5 ? 'var(--mep-neg)' : 'var(--mep-fg-2)'};">{pct(row.rate)}</td>
            </tr>
          {:else}
            <tr><td colspan="4" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.trendTitle')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colWeek')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" style="padding:10px 16px;text-align:left;width:45%;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;"></th>
          </tr>
        </thead>
        <tbody>
          {#each data.trend as point}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td class="num" style="padding:9px 16px;color:var(--mep-fg-2);">{new Date(point.week).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{point.corrections.toLocaleString('en-US')}</td>
              <td style="padding:9px 16px;">
                <div style="height:8px;border-radius:4px;background:var(--mep-acc);width:{Math.max(2, (point.corrections / maxTrend) * 100)}%;"></div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="3" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.promptVersionTitle')} sub={$t('admin.learning.promptVersionSub')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colPromptVersion')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colDocuments')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colAvgConfidence')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colMismatches')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colInvoices')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colRate')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.dlq.colLastSeen')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.byPromptVersion as row (row.promptVersion)}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg);font-family:var(--mep-fs-mono);">{row.promptVersion}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{row.documents.toLocaleString('en-US')}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);">{row.avgConfidence !== null ? row.avgConfidence.toFixed(2) : '—'}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:{row.totalMismatches > 0 ? 'var(--mep-warn)' : 'var(--mep-fg-2)'};">{row.totalMismatches.toLocaleString('en-US')}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);">{row.invoices.toLocaleString('en-US')}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);">{row.corrections.toLocaleString('en-US')}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:{row.correctionRate !== null && row.correctionRate > 0.5 ? 'var(--mep-neg)' : 'var(--mep-fg-2)'};">{pct(row.correctionRate)}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg-3);white-space:nowrap;">{row.lastSeen ? new Date(row.lastSeen).toLocaleDateString('en-GB', { dateStyle: 'short' }) : '—'}</td>
            </tr>
          {:else}
            <tr><td colspan="8" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.matchingTitle')} sub={$t('admin.learning.matchingSubtitle')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colSource')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colTotal')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colPending')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.aliasStats as row}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;color:var(--mep-fg);">{SOURCE_LABEL[row.source] ?? row.source}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{row.total.toLocaleString('en-US')}</td>
              <td class="num" style="padding:9px 16px;text-align:right;color:{row.pending > 0 ? 'var(--mep-warn)' : 'var(--mep-fg-2)'};">{row.pending.toLocaleString('en-US')}</td>
            </tr>
          {:else}
            <tr><td colspan="3" style="padding:24px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.fuzzyOutcomesTitle')} sub={$t('admin.learning.fuzzyOutcomesSub')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colTotal')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colConfirmed')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colRejected')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colPending')}</th>
            <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colAccuracy')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{data.fuzzyOutcomes.total.toLocaleString('en-US')}</td>
            <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-pos);">{data.fuzzyOutcomes.confirmed.toLocaleString('en-US')}</td>
            <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-neg);">{data.fuzzyOutcomes.rejected.toLocaleString('en-US')}</td>
            <td class="num" style="padding:9px 16px;text-align:right;color:{data.fuzzyOutcomes.pending > 0 ? 'var(--mep-warn)' : 'var(--mep-fg-2)'};">{data.fuzzyOutcomes.pending.toLocaleString('en-US')}</td>
            <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{pct(data.fuzzyOutcomes.accuracyRate)}</td>
          </tr>
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  {#if data.pendingFuzzy.length > 0}
    <SectionCard title={$t('admin.learning.pendingFuzzyTitle')} noPad>
      <AdminTableScroll>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colRestaurant')}</th>
              <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colProduct')}</th>
              <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colRawText')}</th>
              <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.learning.colCreated')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.pendingFuzzy as row (row.id)}
              <tr style="border-bottom:1px solid var(--mep-divider);">
                <td style="padding:9px 16px;color:var(--mep-fg-2);">{row.restaurantName ?? '—'}</td>
                <td style="padding:9px 16px;color:var(--mep-fg);">{row.productName}</td>
                <td style="padding:9px 16px;color:var(--mep-fg-2);">{row.rawText ?? '—'}</td>
                <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg-3);white-space:nowrap;">{new Date(row.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </SectionCard>
  {/if}

  <a href="/admin" style="font-size:13px;color:var(--mep-acc);text-decoration:none;">{$t('admin.backToOverview')}</a>

</div>
