<script lang="ts">
  import type { PageData } from './$types';
  import { t, tcat, locale } from '$lib/i18n';
  import MobileAnalyticsSpend from '$lib/components/mobile/MobileAnalyticsSpend.svelte';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import PeriodPills from '$lib/components/mep/PeriodPills.svelte';
  import TrendLineChart from '$lib/components/mep/TrendLineChart.svelte';

  let { data }: { data: PageData } = $props();

  const SERIES_PALETTE = [
    'var(--mep-acc)', 'var(--mep-acc-2)', 'var(--mep-series-1)', 'var(--mep-series-2)',
    'var(--mep-series-3)', 'var(--mep-series-4)', 'var(--mep-series-5)', 'var(--mep-series-other)',
  ];

  const trendFmt = $derived(new Intl.DateTimeFormat($locale === 'en' ? 'en-US' : 'es-ES', { month: 'short' }));
  // Month-grain buckets always show the year -- same rule everywhere a bucket
  // label is rendered, so switching between chart modes never changes format.
  function formatMonthBucket(bucket: string): string {
    const [y, m] = bucket.split('-').map(Number);
    return `${trendFmt.format(new Date(y, m - 1, 1))} ${String(y).slice(2)}`;
  }
  function formatSpendBucketLabel(bucket: string): string {
    // 'YYYY-MM' (year/all periods) or 'YYYY-MM-DD' (day/month periods)
    if (bucket.length === 7) return formatMonthBucket(bucket);
    const [, , d] = bucket.split('-');
    return String(Number(d));
  }

  let trendMode = $state<'category' | 'product'>('category');
  let selectedCategories = $state<string[]>(data.trendCategories.slice(0, 4));
  let selectedProducts = $state<string[]>(data.priceTrendSeries.slice(0, 4).map(s => s.key));

  function toggle(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter(k => k !== key) : [...list, key];
  }

  const categoryChart = $derived.by(() => {
    const buckets = [...new Set(data.trend.map(r => r.bucket))].sort();
    const series = selectedCategories.map((cat, i) => {
      const byBucket = new Map<string, number>();
      for (const r of data.trend) if (r.category === cat) byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0) + r.amount);
      return {
        key: cat, label: $tcat(cat), color: SERIES_PALETTE[i % SERIES_PALETTE.length],
        values: buckets.map(b => byBucket.get(b) ?? 0),
      };
    });
    return { xLabels: buckets.map(formatSpendBucketLabel), series };
  });

  const productChart = $derived.by(() => {
    const selected = data.priceTrendSeries.filter(s => selectedProducts.includes(s.key));
    const buckets = [...new Set(selected.flatMap(s => s.points.map(p => p.bucket)))].sort();
    const series = selected.map((s, i) => {
      const byBucket = new Map(s.points.map(p => [p.bucket, p.value]));
      return {
        key: s.key, label: s.label, color: SERIES_PALETTE[i % SERIES_PALETTE.length],
        values: buckets.map(b => byBucket.get(b) ?? 0),
      };
    });
    return { xLabels: buckets.map(formatMonthBucket), series };
  });

  const PERIODS: Array<['day' | 'month' | 'year' | 'all', string]> = [
    ['day',   'inv.period.day'],
    ['month', 'inv.period.month'],
    ['year',  'inv.period.year'],
    ['all',   'inv.period.all'],
  ];

  function fmtEur(n: number | null | undefined) {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0) + ' €';
  }

  const SERIES_COLORS = ['var(--mep-series-1)', 'var(--mep-series-2)', 'var(--mep-series-3)', 'var(--mep-series-4)', 'var(--mep-series-5)'];
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileAnalyticsSpend
    period={data.period}
    kpis={data.kpis}
    top_items={data.top_items}
    category_spend={data.category_spend}
    trend={data.trend}
    trendCategories={data.trendCategories}
    priceTrendSeries={data.priceTrendSeries}
  />
</div>

<div class="hidden md:block" style="height:100%;overflow:auto;">
  <div style="padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px;">

    <div style="display:flex;align-items:center;gap:12px;">
      <h2 style="margin:0;font-size:14px;font-weight:500;color:var(--mep-fg-3);flex:1;">{$t('spend.question')}</h2>
      <PeriodPills active={data.period} pills={PERIODS.map(([val, labelKey]) => ({ value: val, label: $t(labelKey), href: `?period=${val}` }))} />
    </div>

    <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2" data-coach="analytics-main">
      <KpiCard
        label={$t('spend.totalSpend')}
        value={fmtEur(data.kpis.total_items_spend)}
        delta={data.kpis.spend_delta_pct !== null ? Math.round(data.kpis.spend_delta_pct * 10) / 10 : undefined}
        deltaCtx={data.kpis.spend_delta_pct !== null ? $t('inv.kpi.vsPrev') : undefined}
        spark={data.kpis.spend_spark ?? undefined}
        sparkPrev={data.kpis.spend_spark_prev ?? undefined}
        invert
      />
      <KpiCard
        label={$t('spend.kpi.topCategory')}
        value={data.kpis.top_category ? $tcat(data.kpis.top_category.category) : $t('spend.kpi.noData')}
        sub={data.kpis.top_category ? fmtEur(data.kpis.top_category.total) : undefined}
        valueIsName
      />
      <KpiCard
        label={$t('spend.kpi.topSupplier')}
        value={data.kpis.top_supplier ? data.kpis.top_supplier.name : $t('spend.kpi.noData')}
        sub={data.kpis.top_supplier ? fmtEur(data.kpis.top_supplier.total) : undefined}
        valueIsName
      />
      <KpiCard
        label={$t('spend.avgItems')}
        value={data.kpis.avg_invoice_items != null ? data.kpis.avg_invoice_items.toFixed(1) : '—'}
      />
    </div>

    <div class="card" style="padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <div class="subtitle">{$t('spend.trend.title')}</div>
        <div class="period-track" role="group">
          <button type="button" class="period-pill {trendMode === 'category' ? 'active' : ''}" onclick={() => (trendMode = 'category')}>
            {$t('spend.trend.byCategory')}
          </button>
          <button type="button" class="period-pill {trendMode === 'product' ? 'active' : ''}" onclick={() => (trendMode = 'product')}>
            {$t('spend.trend.byProduct')}
          </button>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
        {#if trendMode === 'category'}
          {#each data.trendCategories as cat, i}
            {@const active = selectedCategories.includes(cat)}
            {@const color = SERIES_PALETTE[selectedCategories.indexOf(cat) % SERIES_PALETTE.length]}
            <button type="button" onclick={() => (selectedCategories = toggle(selectedCategories, cat))}
              class="badge" style="
                cursor:pointer;border:1px solid {active ? color : 'var(--mep-border)'};
                background:{active ? color + '1e' : 'transparent'};
                color:{active ? color : 'var(--mep-fg-3)'};
              ">
              {$tcat(cat)}
            </button>
          {/each}
          {#if !data.trendCategories.length}
            <span class="body" style="font-size:12px;color:var(--mep-fg-3);">{$t('spend.kpi.noData')}</span>
          {/if}
        {:else}
          {#each data.priceTrendSeries as item}
            {@const active = selectedProducts.includes(item.key)}
            {@const color = SERIES_PALETTE[selectedProducts.indexOf(item.key) % SERIES_PALETTE.length]}
            <button type="button" onclick={() => (selectedProducts = toggle(selectedProducts, item.key))}
              class="badge" style="
                cursor:pointer;border:1px solid {active ? color : 'var(--mep-border)'};
                background:{active ? color + '1e' : 'transparent'};
                color:{active ? color : 'var(--mep-fg-3)'};
              ">
              {item.label}
            </button>
          {/each}
          {#if !data.priceTrendSeries.length}
            <span class="body" style="font-size:12px;color:var(--mep-fg-3);">{$t('spend.kpi.noData')}</span>
          {/if}
        {/if}
      </div>

      {#if trendMode === 'category'}
        <TrendLineChart xLabels={categoryChart.xLabels} series={categoryChart.series} valueFormatter={fmtEur} emptyLabel={$t('spend.noDataYet')} />
      {:else}
        <TrendLineChart xLabels={productChart.xLabels} series={productChart.series} valueFormatter={(v) => fmtEur(v) + '/u'} emptyLabel={$t('spend.noDataYet')} />
      {/if}
    </div>

    <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">

      <div class="card col-span-3 max-[900px]:col-span-2" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{$t('spend.topItems')}</div>
        <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">{$t('spend.topItemsSub')}</div>
        {#if !data.top_items.length}
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 0;text-align:center;">
            <div style="font-size:24px;opacity:0.25;">📊</div>
            <p class="body-strong" style="color:var(--mep-fg-3);">{$t('spend.noDataYet')}</p>
            <p class="body" style="color:var(--mep-fg-4);font-size:12px;max-width:240px;">{$t('spend.emptyHint')}</p>
            <a href="/" style="font-size:12px;color:var(--mep-acc);text-decoration:none;margin-top:4px;">{$t('spend.uploadFirst')}</a>
          </div>
        {:else}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each data.top_items.slice(0, 6) as item, i}
              <div>
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:5px;">
                  <span style="font-size:12.5px;color:var(--mep-fg-2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title={item.description}>
                    {item.description}
                  </span>
                  <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);flex-shrink:0;">{fmtEur(item.total_spend)}</span>
                </div>
                <div style="height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:hidden;">
                  <div style="width:{item.pct}%;height:100%;background:{SERIES_COLORS[i % SERIES_COLORS.length]};border-radius:4px;"></div>
                </div>
                {#if item.item_count != null}
                  <div style="margin-top:3px;font-size:11px;color:var(--mep-fg-3);">
                    {item.item_count} {$t('tbl.lines')}{item.avg_unit_price != null ? ` · ${$t('sup.products.avgPrice')} ${fmtEur(item.avg_unit_price)}` : ''}{item.supplier_name ? ` · ${item.supplier_name}` : ''}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="card col-span-1 max-[900px]:col-span-2" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{$t('spend.byCategory')}</div>
        <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">{$t('spend.byCategorySub')}</div>
        {#if !data.category_spend.length}
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 0;text-align:center;">
            <p class="body" style="color:var(--mep-fg-4);font-size:12px;max-width:200px;">{$t('spend.assignCategories')}</p>
            <a href="/suppliers" style="font-size:12px;color:var(--mep-acc);text-decoration:none;">{$t('spend.viewSuppliers')}</a>
          </div>
        {:else}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each data.category_spend as cat}
              <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                  <span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--mep-fg-2);">
                    <span style="width:10px;height:10px;border-radius:2px;background:{cat.color};display:inline-block;flex-shrink:0;"></span>
                    {$tcat(cat.category)}
                  </span>
                  <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">{fmtEur(cat.total)}</span>
                </div>
                <div style="height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:hidden;">
                  <div style="width:{cat.pct}%;height:100%;background:{cat.color};border-radius:4px;"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    </div>

  </div>
</div>
