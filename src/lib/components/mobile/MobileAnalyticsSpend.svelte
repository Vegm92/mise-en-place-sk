<script lang="ts">
  import { locale, t, tcat, tp } from '$lib/i18n';
  import { fmtEurCompact, fmtMonthShort } from '$lib/formatters';

  import { categoryColor, seriesColor, SERIES_OTHER } from '$lib/colors';
  import { computeDonutSlices } from '$lib/donut-math';
  import DonutChart from '$lib/components/mep/DonutChart.svelte';
  import TrendLineChart from '$lib/components/mep/TrendLineChart.svelte';
  interface Kpis {
    total_items_spend: number | null;
    total_line_items: number | null;
    unique_items: number | null;
    avg_invoice_items: number | null;
  }
  interface TopItem {
    description: string;
    total_spend: number;
    pct: number;
    item_count?: number | null;
    avg_unit_price?: number | null;
    supplier_name?: string | null;
    price_trend?: number[];
  }
  interface CategorySpend {
    category: string;
    total: number;
    pct: number;
  }
  interface MonthlySpend {
    month: string;
    total: number;
  }

  let {
    period,
    kpis,
    top_items,
    category_spend,
    monthly_spend,
    has_invoices,
    invoices_outside_range,
  }: {
    period: string;
    kpis: Kpis;
    top_items: TopItem[];
    category_spend: CategorySpend[];
    monthly_spend: MonthlySpend[];
    has_invoices: boolean;
    invoices_outside_range: number;
  } = $props();

  const periods = $derived<Array<[string, string]>>([
    ['1m', t('spend.period.monthShort')],
    ['3m',  t('spend.period.quarterShort')],
    ['6m', t('spend.period.halfShort')],
    ['all', t('spend.period.allShort')],
  ]);

  function fmtEur(n: number | null | undefined) {
    return fmtEurCompact(n ?? 0, locale.current);
  }

  const DONUT_RADIUS = 60;

  const topItemInputs = $derived((() => {
    const ranked = [...top_items].sort((a, b) => b.total_spend - a.total_spend);
    const top = ranked.slice(0, 5);
    const rest = ranked.slice(5);
    const restSpend = rest.reduce((a, p) => a + p.total_spend, 0);

    const entries = top.map((p, i) => ({ label: p.description, value: p.total_spend, color: seriesColor(i) }));
    if (restSpend > 0) entries.push({ label: t('spend.other'), value: restSpend, color: SERIES_OTHER });
    return entries;
  })());
  const spendDonut = $derived(computeDonutSlices(topItemInputs, DONUT_RADIUS));

  const categoryInputs = $derived(category_spend.map(cat => ({
    key: cat.category, label: tcat(cat.category), value: cat.total, color: categoryColor(cat.category),
  })));
  const categoryDonut = $derived(computeDonutSlices(categoryInputs, DONUT_RADIUS));

  const yearlyLabels = $derived(monthly_spend.map(m => fmtMonthShort(m.month, locale.current)));
  const yearlySeries = $derived([
    { key: 'spend', label: t('spend.yearly.series'), color: seriesColor(0), values: monthly_spend.map(m => m.total) },
  ]);
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 14px;">

    <div style="display: flex; gap: 6px; padding-top: 4px;">
      {#each periods as [val, short]}
        <a href="?period={val}" class="chip {period === val ? 'active' : ''}">{short}</a>
      {/each}
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{t('spend.totalSpend')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {fmtEur(kpis?.total_items_spend)}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{t('tbl.lines')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.total_line_items ?? '—'}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{t('spend.uniqueItems')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.unique_items ?? '—'}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{t('spend.avgItems')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.avg_invoice_items != null ? kpis.avg_invoice_items.toFixed(1) : '—'}
        </div>
      </div>
    </div>

    <div class="card" style="padding: 14px;">
      <div class="subtitle" style="font-size: 15px; margin-bottom: 2px;">{t('spend.topProducts')}</div>
      <div style="font-size: 11px; color: var(--mep-fg-3); margin-bottom: 12px;">{t('spend.topItemsSub')}</div>
      {#if !top_items?.length && has_invoices && invoices_outside_range > 0}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 0; text-align: center;">
          <div style="font-size: 24px; opacity: 0.25;">📅</div>
          <p class="body-strong" style="color: var(--mep-fg-3); margin: 0;">{t('spend.noneInRange')}</p>
          <p class="body" style="color: var(--mep-fg-4); font-size: 13px; max-width: 240px; margin: 0;">{tp('spend.noneInRangeHint', invoices_outside_range)}</p>
          <a href="?period=all" style="font-size: 13px; color: var(--mep-acc); text-decoration: none; display: inline-flex; align-items: center; min-height: 44px;">{t('spend.widenRange')}</a>
        </div>
      {:else if !top_items?.length}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 0; text-align: center;">
          <div style="font-size: 24px; opacity: 0.25;">📊</div>
          <p class="body-strong" style="color: var(--mep-fg-3); margin: 0;">{t('spend.noDataYet')}</p>
          <p class="body" style="color: var(--mep-fg-4); font-size: 13px; max-width: 240px; margin: 0;">{t('spend.emptyHint')}</p>
          <a href="/" style="font-size: 13px; color: var(--mep-acc); text-decoration: none; display: inline-flex; align-items: center; min-height: 44px;">{t('spend.uploadFirst')}</a>
        </div>
      {:else}
        <div class="flex flex-col items-center gap-3.5" role="group" aria-label={t('spend.donut.topItemsAria')}>
          <DonutChart
            slices={topItemInputs}
            radius={DONUT_RADIUS}
            size={156}
            strokeWidth={22}
            hoverStrokeWidth={22}
            centerLabel={t('spend.totalSpend')}
            valueFormatter={fmtEur}
          />
          <div style="display: flex; flex-direction: column; gap: 7px; width: 100%;">
            {#each spendDonut.slices as slice}
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 9px; height: 9px; border-radius: 2px; background: {slice.color}; flex-shrink: 0;"></span>
                <span class="body flex-1 min-w-0 truncate">{slice.label}</span>
                <span class="num text-[11px] text-fg-3 shrink-0">{Math.round(slice.pct * 100)}%</span>
                <span class="num body-strong shrink-0 w-[70px] text-right">{fmtEur(slice.value)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="card" style="padding: 14px 14px 6px;">
      <div class="subtitle" style="font-size: 15px; margin-bottom: 2px;">{t('spend.byCategory')}</div>
      <div style="font-size: 11px; color: var(--mep-fg-3); margin-bottom: 12px;">{t('spend.byCategorySub')}</div>
      {#if !category_spend?.length}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 0 20px; text-align: center;">
          <p class="body" style="color: var(--mep-fg-4); font-size: 13px; max-width: 220px; margin: 0;">{t('spend.assignCategories')}</p>
          <a href="/suppliers" style="font-size: 13px; color: var(--mep-acc); text-decoration: none; display: inline-flex; align-items: center; min-height: 44px;">{t('spend.viewSuppliers')}</a>
        </div>
      {:else}
        <div class="flex flex-col items-center gap-3.5 pb-1.5" role="group" aria-label={t('spend.donut.categoryAria')}>
          <DonutChart
            slices={categoryInputs}
            radius={DONUT_RADIUS}
            size={156}
            strokeWidth={22}
            hoverStrokeWidth={22}
            centerLabel={t('spend.totalSpend')}
            valueFormatter={fmtEur}
          />
          <div class="flex flex-col gap-[7px] w-full">
            {#each categoryDonut.slices as slice}
              <div class="flex items-center gap-2">
                <span class="w-[9px] h-[9px] rounded-sm shrink-0" style="background:{slice.color};"></span>
                <span class="body flex-1 min-w-0 truncate">{slice.label}</span>
                <span class="num text-[11px] text-fg-3 shrink-0">{Math.round(slice.pct * 100)}%</span>
                <span class="num body-strong shrink-0 w-[70px] text-right">{fmtEur(slice.value)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="card p-3.5">
      <div class="subtitle text-[15px] mb-0.5">{t('spend.yearly.title')}</div>
      <div class="text-[11px] text-fg-3 mb-2.5">{t('spend.yearly.sub')}</div>
      <TrendLineChart
        xLabels={yearlyLabels}
        series={yearlySeries}
        valueFormatter={(n) => fmtEur(n)}
        emptyLabel={t('spend.yearly.empty')}
      />
    </div>

  </div>
</div>
