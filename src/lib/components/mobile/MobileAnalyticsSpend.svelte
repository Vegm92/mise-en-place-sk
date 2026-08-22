<script lang="ts">
  import { t, tcat, locale } from '$lib/i18n';
  import TrendLineChart from '$lib/components/mep/TrendLineChart.svelte';

  interface Kpis {
    total_items_spend: number | null;
    invoice_count: number;
  }
  interface TopItem {
    description: string;
    total_spend: number;
    pct: number;
    pctOfTotal: number;
    item_count?: number | null;
    avg_unit_price?: number | null;
    supplier_name?: string | null;
    price_trend?: number[];
  }
  interface TypeSpend {
    type: string;
    total: number;
    pct: number;
    color: string;
  }
  interface RecurringSupplier { name: string; count: number; pct: number; }
  interface TrendRow { bucket: string; category: string; amount: number; }
  interface PriceTrendItem { key: string; label: string; points: { bucket: string; value: number }[]; }

  let {
    period,
    kpis,
    top_items,
    most_expensive_item,
    type_spend,
    recurring_suppliers,
    trend,
    trendCategories,
    priceTrendSeries,
  }: {
    period: string;
    kpis: Kpis;
    top_items: TopItem[];
    most_expensive_item: TopItem | null;
    type_spend: TypeSpend[];
    recurring_suppliers: RecurringSupplier[];
    trend: TrendRow[];
    trendCategories: string[];
    priceTrendSeries: PriceTrendItem[];
  } = $props();

  function typeLabel(type: string): string {
    if (type === 'Bebidas') return $t('suptype.bebidas');
    if (type === 'Comida') return $t('suptype.comida');
    if (type === 'Artículos') return $t('suptype.articulos');
    return $t('spend.other');
  }

  const SERIES_PALETTE = [
    'var(--mep-acc)', 'var(--mep-acc-2)', 'var(--mep-series-1)', 'var(--mep-series-2)',
    'var(--mep-series-3)', 'var(--mep-series-4)', 'var(--mep-series-5)', 'var(--mep-series-other)',
  ];

  const trendFmt = $derived(new Intl.DateTimeFormat($locale === 'en' ? 'en-US' : 'es-ES', { month: 'short' }));
  function formatMonthBucket(bucket: string): string {
    const [y, m] = bucket.split('-').map(Number);
    return `${trendFmt.format(new Date(y, m - 1, 1))} ${String(y).slice(2)}`;
  }
  function formatSpendBucketLabel(bucket: string): string {
    if (bucket.length === 7) return formatMonthBucket(bucket);
    const [, , d] = bucket.split('-');
    return String(Number(d));
  }

  let trendMode = $state<'category' | 'product'>('category');
  let selectedCategories = $state<string[]>(trendCategories.slice(0, 3));
  let selectedProducts = $state<string[]>(priceTrendSeries.slice(0, 3).map(s => s.key));

  function toggle(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter(k => k !== key) : [...list, key];
  }

  const categoryChart = $derived.by(() => {
    const buckets = [...new Set(trend.map(r => r.bucket))].sort();
    const series = selectedCategories.map((cat, i) => {
      const byBucket = new Map<string, number>();
      for (const r of trend) if (r.category === cat) byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0) + r.amount);
      return {
        key: cat, label: $tcat(cat), color: SERIES_PALETTE[i % SERIES_PALETTE.length],
        values: buckets.map(b => byBucket.get(b) ?? 0),
      };
    });
    return { xLabels: buckets.map(formatSpendBucketLabel), series };
  });

  const productChart = $derived.by(() => {
    const selected = priceTrendSeries.filter(s => selectedProducts.includes(s.key));
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

  const periods: Array<[string, string]> = [
    ['day',   $t('inv.period.day')],
    ['month', $t('inv.period.month')],
    ['year',  $t('inv.period.year')],
    ['all',   $t('inv.period.all')],
  ];

  function fmtEur(n: number | null | undefined) {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0) + ' €';
  }

  const SERIES_COLORS = ['var(--mep-series-1)', 'var(--mep-series-2)', 'var(--mep-series-3)', 'var(--mep-series-4)', 'var(--mep-series-5)'];
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 14px;">

    <div style="display: flex; gap: 6px; padding-top: 4px;">
      {#each periods as [val, short]}
        <a href="?period={val}" style="
          height: 30px; padding: 0 12px; border-radius: 15px;
          background: {period === val ? 'var(--mep-acc)' : 'var(--mep-surface)'};
          color: {period === val ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};
          font-size: 12px; font-weight: 500; text-decoration: none;
          display: inline-flex; align-items: center;
          box-shadow: {period === val ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'};
        ">{short}</a>
      {/each}
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">{$t('spend.totalSpend')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {fmtEur(kpis?.total_items_spend)}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">{$t('spend.invoiceCount')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.invoice_count ?? '—'}
        </div>
      </div>
    </div>

    <div class="card" style="padding: 14px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px;">
        <div class="subtitle" style="font-size: 14px;">{$t('spend.trend.title')}</div>
        <div class="period-track" role="group">
          <button type="button" class="period-pill {trendMode === 'category' ? 'active' : ''}" onclick={() => (trendMode = 'category')}>
            {$t('spend.trend.byCategory')}
          </button>
          <button type="button" class="period-pill {trendMode === 'product' ? 'active' : ''}" onclick={() => (trendMode = 'product')}>
            {$t('spend.trend.byProduct')}
          </button>
        </div>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px;">
        {#if trendMode === 'category'}
          {#each trendCategories as cat}
            {@const active = selectedCategories.includes(cat)}
            {@const color = SERIES_PALETTE[selectedCategories.indexOf(cat) % SERIES_PALETTE.length]}
            <button type="button" onclick={() => (selectedCategories = toggle(selectedCategories, cat))}
              class="badge" style="cursor:pointer;border:1px solid {active ? color : 'var(--mep-border)'};background:{active ? color + '1e' : 'transparent'};color:{active ? color : 'var(--mep-fg-3)'};">
              {$tcat(cat)}
            </button>
          {/each}
        {:else}
          {#each priceTrendSeries as item}
            {@const active = selectedProducts.includes(item.key)}
            {@const color = SERIES_PALETTE[selectedProducts.indexOf(item.key) % SERIES_PALETTE.length]}
            <button type="button" onclick={() => (selectedProducts = toggle(selectedProducts, item.key))}
              class="badge" style="cursor:pointer;border:1px solid {active ? color : 'var(--mep-border)'};background:{active ? color + '1e' : 'transparent'};color:{active ? color : 'var(--mep-fg-3)'};">
              {item.label}
            </button>
          {/each}
        {/if}
      </div>

      {#if trendMode === 'category'}
        <TrendLineChart xLabels={categoryChart.xLabels} series={categoryChart.series} valueFormatter={fmtEur} emptyLabel={$t('spend.noDataYet')} />
      {:else}
        <TrendLineChart xLabels={productChart.xLabels} series={productChart.series} valueFormatter={(v) => fmtEur(v) + '/u'} emptyLabel={$t('spend.noDataYet')} />
      {/if}
    </div>

    {#if top_items?.length > 0}
      <div class="card" style="padding: 14px;">
        <div class="subtitle" style="font-size: 15px; margin-bottom: 4px;">{$t('spend.topProducts')}</div>
        {#if most_expensive_item}
          <div style="font-size: 11.5px; color: var(--mep-fg-3); margin-bottom: 12px;">
            {$t('spend.mostExpensive')} <span style="color:var(--mep-fg-2);font-weight:500;">{most_expensive_item.description}</span>
            {most_expensive_item.avg_unit_price != null ? `— ${fmtEur(most_expensive_item.avg_unit_price)}/u` : ''}
          </div>
        {/if}
        <div style="display: flex; flex-direction: column; gap: 10px;">
          {#each top_items.slice(0, 6) as item, i}
            <div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 5px;">
                <span style="font-size: 12px; color: var(--mep-fg-2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{item.description}</span>
                <span class="num" style="font-size: 12px; font-weight: 500; color: var(--mep-fg); flex-shrink: 0;">{fmtEur(item.total_spend)} · {item.pctOfTotal}%</span>
              </div>
              <div style="height: 7px; border-radius: 3px; background: var(--mep-surface-2); overflow: hidden;">
                <div style="width: {item.pct}%; height: 100%; background: {SERIES_COLORS[i % SERIES_COLORS.length]}; border-radius: 3px;"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if type_spend?.length > 0}
      <div class="card" style="padding: 14px 14px 6px;">
        <div class="subtitle" style="font-size: 15px; margin-bottom: 4px;">{$t('spend.byCategory')}</div>
        <div style="font-size: 11.5px; color: var(--mep-fg-3); margin-bottom: 12px;">{$t('spend.byCategorySub')}</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          {#each type_spend as t2}
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--mep-fg-2);">
                  <span style="width: 10px; height: 10px; border-radius: 2px; background: {t2.color}; display: inline-block; flex-shrink: 0;"></span>
                  {typeLabel(t2.type)}
                </span>
                <span class="num" style="font-size: 12.5px; font-weight: 500; color: var(--mep-fg);">{fmtEur(t2.total)} · {t2.pct}%</span>
              </div>
              <div style="height: 6px; border-radius: 3px; background: var(--mep-surface-2); overflow: hidden;">
                <div style="width: {t2.pct}%; height: 100%; background: {t2.color}; border-radius: 3px;"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if recurring_suppliers?.length > 0}
      <div class="card" style="padding: 14px 14px 6px;">
        <div class="subtitle" style="font-size: 15px; margin-bottom: 4px;">{$t('spend.recurringSuppliers')}</div>
        <div style="font-size: 11.5px; color: var(--mep-fg-3); margin-bottom: 12px;">{$t('spend.recurringSuppliersSub')}</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          {#each recurring_suppliers as sup, i}
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="font-size: 12.5px; color: var(--mep-fg-2); flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{sup.name}</span>
                <span class="num" style="font-size: 12.5px; font-weight: 500; color: var(--mep-fg);">{sup.count} · {sup.pct}%</span>
              </div>
              <div style="height: 6px; border-radius: 3px; background: var(--mep-surface-2); overflow: hidden;">
                <div style="width: {sup.pct}%; height: 100%; background: {SERIES_COLORS[i % SERIES_COLORS.length]}; border-radius: 3px;"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  </div>
</div>
