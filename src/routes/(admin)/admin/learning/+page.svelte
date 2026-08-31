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

<div class="px-3 md:px-6 pb-6 flex flex-col gap-4">

  <div class="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
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
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colField')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colAvgConfidence')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.byField as row}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4 text-fg font-mono">{row.fieldName}</td>
              <td class="num py-[9px] px-4 text-right text-fg">{row.corrections.toLocaleString('en-US')}</td>
              <td class="num py-[9px] px-4 text-right text-fg-2">{row.avgConfidence !== null ? row.avgConfidence.toFixed(2) : '—'}</td>
            </tr>
          {:else}
            <tr><td colspan="3" class="py-6 px-4 text-center text-fg-4">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.bySupplierTitle')} noPad>
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colSupplier')}</th>
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colRestaurant')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colCorrections')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.bySupplier as row}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4 text-fg">{row.supplierName ?? '—'}</td>
              <td class="py-[9px] px-4 text-fg-2">{row.restaurantName ?? '—'}</td>
              <td class="num py-[9px] px-4 text-right text-fg">{row.corrections.toLocaleString('en-US')}</td>
            </tr>
          {:else}
            <tr><td colspan="3" class="py-6 px-4 text-center text-fg-4">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.byTenantTitle')} noPad>
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colRestaurant')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colInvoices')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colRate')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.byTenant as row}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4 text-fg">{row.restaurantName}</td>
              <td class="num py-[9px] px-4 text-right text-fg">{row.corrections.toLocaleString('en-US')}</td>
              <td class="num py-[9px] px-4 text-right text-fg-2">{row.invoices.toLocaleString('en-US')}</td>
              <td class="num py-[9px] px-4 text-right {row.rate !== null && row.rate > 0.5 ? 'text-neg' : 'text-fg-2'}">{pct(row.rate)}</td>
            </tr>
          {:else}
            <tr><td colspan="4" class="py-6 px-4 text-center text-fg-4">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.trendTitle')} noPad>
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colWeek')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" class="py-2.5 px-4 text-left w-[45%] text-[11px] font-semibold text-fg-3 uppercase tracking-wider"></th>
          </tr>
        </thead>
        <tbody>
          {#each data.trend as point}
            <tr class="border-b border-divider">
              <td class="num py-[9px] px-4 text-fg-2">{new Date(point.week).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
              <td class="num py-[9px] px-4 text-right text-fg">{point.corrections.toLocaleString('en-US')}</td>
              <td class="py-[9px] px-4">
                <div class="h-2 rounded bg-acc" style="width:{Math.max(2, (point.corrections / maxTrend) * 100)}%;"></div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="3" class="py-6 px-4 text-center text-fg-4">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.promptVersionTitle')} sub={$t('admin.learning.promptVersionSub')} noPad>
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colPromptVersion')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colDocuments')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colAvgConfidence')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colMismatches')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colInvoices')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colCorrections')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colRate')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.dlq.colLastSeen')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.byPromptVersion as row (row.promptVersion)}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4 text-fg font-mono">{row.promptVersion}</td>
              <td class="num py-[9px] px-4 text-right text-fg">{row.documents.toLocaleString('en-US')}</td>
              <td class="num py-[9px] px-4 text-right text-fg-2">{row.avgConfidence !== null ? row.avgConfidence.toFixed(2) : '—'}</td>
              <td class="num py-[9px] px-4 text-right {row.totalMismatches > 0 ? 'text-warn' : 'text-fg-2'}">{row.totalMismatches.toLocaleString('en-US')}</td>
              <td class="num py-[9px] px-4 text-right text-fg-2">{row.invoices.toLocaleString('en-US')}</td>
              <td class="num py-[9px] px-4 text-right text-fg-2">{row.corrections.toLocaleString('en-US')}</td>
              <td class="num py-[9px] px-4 text-right {row.correctionRate !== null && row.correctionRate > 0.5 ? 'text-neg' : 'text-fg-2'}">{pct(row.correctionRate)}</td>
              <td class="num py-[9px] px-4 text-right text-fg-3 whitespace-nowrap">{row.lastSeen ? new Date(row.lastSeen).toLocaleDateString('en-GB', { dateStyle: 'short' }) : '—'}</td>
            </tr>
          {:else}
            <tr><td colspan="8" class="py-6 px-4 text-center text-fg-4">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.matchingTitle')} sub={$t('admin.learning.matchingSubtitle')} noPad>
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colSource')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colTotal')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colPending')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.aliasStats as row}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4 text-fg">{SOURCE_LABEL[row.source] ?? row.source}</td>
              <td class="num py-[9px] px-4 text-right text-fg">{row.total.toLocaleString('en-US')}</td>
              <td class="num py-[9px] px-4 text-right {row.pending > 0 ? 'text-warn' : 'text-fg-2'}">{row.pending.toLocaleString('en-US')}</td>
            </tr>
          {:else}
            <tr><td colspan="3" class="py-6 px-4 text-center text-fg-4">{$t('admin.learning.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  <SectionCard title={$t('admin.learning.fuzzyOutcomesTitle')} sub={$t('admin.learning.fuzzyOutcomesSub')} noPad>
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colTotal')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colConfirmed')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colRejected')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colPending')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colAccuracy')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="num py-[9px] px-4 text-right text-fg">{data.fuzzyOutcomes.total.toLocaleString('en-US')}</td>
            <td class="num py-[9px] px-4 text-right text-pos">{data.fuzzyOutcomes.confirmed.toLocaleString('en-US')}</td>
            <td class="num py-[9px] px-4 text-right text-neg">{data.fuzzyOutcomes.rejected.toLocaleString('en-US')}</td>
            <td class="num py-[9px] px-4 text-right {data.fuzzyOutcomes.pending > 0 ? 'text-warn' : 'text-fg-2'}">{data.fuzzyOutcomes.pending.toLocaleString('en-US')}</td>
            <td class="num py-[9px] px-4 text-right text-fg">{pct(data.fuzzyOutcomes.accuracyRate)}</td>
          </tr>
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  {#if data.pendingFuzzy.length > 0}
    <SectionCard title={$t('admin.learning.pendingFuzzyTitle')} noPad>
      <AdminTableScroll>
        <table class="w-full border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-divider">
              <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colRestaurant')}</th>
              <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colProduct')}</th>
              <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colRawText')}</th>
              <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.learning.colCreated')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.pendingFuzzy as row (row.id)}
              <tr class="border-b border-divider">
                <td class="py-[9px] px-4 text-fg-2">{row.restaurantName ?? '—'}</td>
                <td class="py-[9px] px-4 text-fg">{row.productName}</td>
                <td class="py-[9px] px-4 text-fg-2">{row.rawText ?? '—'}</td>
                <td class="num py-[9px] px-4 text-right text-fg-3 whitespace-nowrap">{new Date(row.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </SectionCard>
  {/if}

  <a href="/admin" class="text-[13px] text-acc no-underline">{$t('admin.backToOverview')}</a>

</div>
