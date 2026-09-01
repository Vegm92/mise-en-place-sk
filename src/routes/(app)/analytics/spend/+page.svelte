<script lang="ts">
  import type { PageData } from './$types';
  import { categoryColor, seriesColor, SERIES_OTHER } from '$lib/colors';
  import { locale, t, tcat, tp } from '$lib/i18n';
  import { fmtEurCompact, fmtMonthShort } from '$lib/formatters';
  import { computeDonutSlices } from '$lib/donut-math';
  import DonutChart from '$lib/components/mep/DonutChart.svelte';
  import TrendLineChart from '$lib/components/mep/TrendLineChart.svelte';
  import MobileAnalyticsSpend from '$lib/components/mobile/MobileAnalyticsSpend.svelte';

  let { data }: { data: PageData } = $props();

  const periods = $derived<Array<[string, string]>>([
    ['month',   $t('spend.period.monthShort')],
    ['quarter', $t('spend.period.quarterShort')],
    ['half',    $t('spend.period.halfShort')],
    ['all',     $t('spend.period.allShort')],
  ]);

  function fmtEur(n: number | null | undefined) {
    return fmtEurCompact(n ?? 0, $locale);
  }

  const DONUT_RADIUS = 70;

  interface TopItemSliceInput {
    label: string; value: number; color: string;
    itemCount: number | null; avgPrice: number | null; supplierName: string | null;
  }
  const topItemInputs = $derived((() => {
    const ranked = [...data.top_items].sort((a, b) => b.total_spend - a.total_spend);
    const top = ranked.slice(0, 5);
    const rest = ranked.slice(5);
    const restSpend = rest.reduce((a, p) => a + p.total_spend, 0);

    const entries: TopItemSliceInput[] = top.map((p, i) => ({
      label: p.description, value: p.total_spend, color: seriesColor(i),
      itemCount: p.item_count ?? null, avgPrice: p.avg_unit_price ?? null, supplierName: p.supplier_name ?? null,
    }));
    if (restSpend > 0) {
      entries.push({ label: $t('spend.other'), value: restSpend, color: SERIES_OTHER,
        itemCount: null, avgPrice: null, supplierName: null });
    }
    return entries;
  })());
  const spendDonut = $derived(computeDonutSlices(topItemInputs, DONUT_RADIUS));
  let hoveredSpendSlice = $state<number | null>(null);

  const categoryInputs = $derived(data.category_spend.map(cat => ({
    key: cat.category, label: $tcat(cat.category), value: cat.total, color: categoryColor(cat.category),
  })));
  const categoryDonut = $derived(computeDonutSlices(categoryInputs, DONUT_RADIUS));
  let hoveredCategorySlice = $state<number | null>(null);

  const yearlyLabels = $derived(data.monthly_spend.map(m => fmtMonthShort(m.month, $locale)));
  const yearlySeries = $derived([
    { key: 'spend', label: $t('spend.yearly.series'), color: seriesColor(0), values: data.monthly_spend.map(m => m.total) },
  ]);
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileAnalyticsSpend
    period={data.activePeriod}
    kpis={data.kpis}
    top_items={data.top_items}
    category_spend={data.category_spend}
    monthly_spend={data.monthly_spend}
    has_invoices={data.has_invoices}
    invoices_outside_range={data.invoices_outside_range}
  />
</div>

<div class="hidden md:block" style="height:100%;overflow:auto;">
  <div style="padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px;">

    <div style="display:flex;align-items:center;gap:12px;">
      <h2 style="margin:0;font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">{$t('spend.question')}</h2>
    </div>

    <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2" data-coach="analytics-main">
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('spend.totalSpend')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{fmtEur(data.kpis.total_items_spend)}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('spend.lineItems')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{data.kpis.total_line_items}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('spend.uniqueItems')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{data.kpis.unique_items}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('spend.avgItems')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">
          {data.kpis.avg_invoice_items != null ? data.kpis.avg_invoice_items.toFixed(1) : '—'}
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:3fr 2fr;gap:12px;">

      <div class="card" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{$t('spend.topItems')}</div>
        <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">{$t('spend.topItemsSub')}</div>
        {#if !data.top_items.length && data.has_invoices && data.invoices_outside_range > 0}
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 0;text-align:center;">
            <div style="font-size:24px;opacity:0.25;">📅</div>
            <p class="body-strong" style="color:var(--mep-fg-3);">{$t('spend.noneInRange')}</p>
            <p class="body" style="color:var(--mep-fg-4);max-width:240px;">{$tp('spend.noneInRangeHint', data.invoices_outside_range)}</p>
            <a href="?period=all" class="body" style="color:var(--mep-acc);text-decoration:none;margin-top:4px;">{$t('spend.widenRange')}</a>
          </div>
        {:else if !data.top_items.length}
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 0;text-align:center;">
            <div style="font-size:24px;opacity:0.25;">📊</div>
            <p class="body-strong" style="color:var(--mep-fg-3);">{$t('spend.noDataYet')}</p>
            <p class="body" style="color:var(--mep-fg-4);font-size:12px;max-width:240px;">{$t('spend.emptyHint')}</p>
            <a href="/" style="font-size:12px;color:var(--mep-acc);text-decoration:none;margin-top:4px;">{$t('spend.uploadFirst')}</a>
          </div>
        {:else}
          <div style="display:flex;gap:24px;align-items:center;" role="group" aria-label={$t('spend.donut.topItemsAria')}>
            <DonutChart
              slices={topItemInputs}
              radius={DONUT_RADIUS}
              centerLabel={$t('spend.totalSpend')}
              valueFormatter={fmtEur}
              bind:hovered={hoveredSpendSlice}
            />

            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;">
              {#each spendDonut.slices as slice, i}
                <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:default;
                  background:{hoveredSpendSlice === i ? 'var(--mep-surface-2)' : 'transparent'};"
                  role="group" aria-label={slice.label}
                  onmouseenter={() => hoveredSpendSlice = i} onmouseleave={() => hoveredSpendSlice = null}>
                  <span style="width:9px;height:9px;border-radius:2px;background:{slice.color};flex-shrink:0;"></span>
                  <span class="body" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title={slice.label}>
                    {slice.label}
                  </span>
                  <span class="num" style="font-size:11px;color:var(--mep-fg-3);flex-shrink:0;width:34px;text-align:right;">{Math.round(slice.pct * 100)}%</span>
                  <span class="num body-strong" style="flex-shrink:0;width:80px;text-align:right;">{fmtEur(slice.value)}</span>
                </div>
                {#if hoveredSpendSlice === i && slice.itemCount != null}
                  <div style="margin:-2px 0 2px 23px;font-size:11px;color:var(--mep-fg-3);">
                    {slice.itemCount} {$t('tbl.lines')}{slice.avgPrice != null ? ` · ${$t('sup.products.avgPrice')} ${fmtEur(slice.avgPrice)}` : ''}{slice.supplierName ? ` · ${slice.supplierName}` : ''}
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="card" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{$t('spend.byCategory')}</div>
        <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">{$t('spend.byCategorySub')}</div>
        {#if !data.category_spend.length}
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 0;text-align:center;">
            <p class="body" style="color:var(--mep-fg-4);font-size:12px;max-width:200px;">{$t('spend.assignCategories')}</p>
            <a href="/suppliers" style="font-size:12px;color:var(--mep-acc);text-decoration:none;">{$t('spend.viewSuppliers')}</a>
          </div>
        {:else}
          <div style="display:flex;gap:18px;align-items:center;" role="group" aria-label={$t('spend.donut.categoryAria')}>
            <DonutChart
              slices={categoryInputs}
              radius={DONUT_RADIUS}
              centerLabel={$t('spend.totalSpend')}
              valueFormatter={fmtEur}
              bind:hovered={hoveredCategorySlice}
            />

            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;">
              {#each categoryDonut.slices as slice, i}
                <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:default;
                  background:{hoveredCategorySlice === i ? 'var(--mep-surface-2)' : 'transparent'};"
                  role="group" aria-label={slice.label}
                  onmouseenter={() => hoveredCategorySlice = i} onmouseleave={() => hoveredCategorySlice = null}>
                  <span style="width:9px;height:9px;border-radius:2px;background:{slice.color};flex-shrink:0;"></span>
                  <span class="body" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title={slice.label}>
                    {slice.label}
                  </span>
                  <span class="num" style="font-size:11px;color:var(--mep-fg-3);flex-shrink:0;width:34px;text-align:right;">{Math.round(slice.pct * 100)}%</span>
                  <span class="num body-strong" style="flex-shrink:0;width:80px;text-align:right;">{fmtEur(slice.value)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

    </div>

    <div class="card" style="padding:16px;">
      <div class="subtitle" style="margin-bottom:4px;">{$t('spend.yearly.title')}</div>
      <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:10px;">{$t('spend.yearly.sub')}</div>
      <TrendLineChart
        xLabels={yearlyLabels}
        series={yearlySeries}
        valueFormatter={(n) => fmtEur(n)}
        emptyLabel={$t('spend.yearly.empty')}
      />
    </div>

  </div>
</div>
