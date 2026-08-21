<script lang="ts">
  import type { PageData } from './$types';
  import { t, tcat } from '$lib/i18n';
  import MobileAnalyticsSpend from '$lib/components/mobile/MobileAnalyticsSpend.svelte';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import PeriodPills from '$lib/components/mep/PeriodPills.svelte';

  let { data }: { data: PageData } = $props();

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
  interface DonutSlice {
    label: string; spend: number; pct: number; color: string;
    itemCount: number | null; avgPrice: number | null; supplierName: string | null;
    dash: number; offset: number;
  }
  const spendDonut = $derived((() => {
    const ranked = [...data.top_items].sort((a, b) => b.total_spend - a.total_spend);
    const total = ranked.reduce((a, p) => a + p.total_spend, 0);
    if (total <= 0) return { slices: [] as DonutSlice[], total: 0 };

    const top = ranked.slice(0, 5);
    const rest = ranked.slice(5);
    const restSpend = rest.reduce((a, p) => a + p.total_spend, 0);

    const entries: Omit<DonutSlice, 'pct' | 'dash' | 'offset'>[] = top.map((p, i) => ({
      label: p.description, spend: p.total_spend, color: SERIES_COLORS[i],
      itemCount: p.item_count ?? null, avgPrice: p.avg_unit_price ?? null, supplierName: p.supplier_name ?? null,
    }));
    if (restSpend > 0) {
      entries.push({ label: $t('spend.other'), spend: restSpend, color: 'var(--mep-series-other)',
        itemCount: null, avgPrice: null, supplierName: null });
    }

    let cursor = 0;
    const CIRC = 2 * Math.PI * 70;
    const slices: DonutSlice[] = entries.map(e => {
      const pct = e.spend / total;
      const dash = pct * CIRC;
      const slice: DonutSlice = { ...e, pct, dash, offset: cursor };
      cursor += dash;
      return slice;
    });
    return { slices, total };
  })());
  let hoveredSpendSlice = $state<number | null>(null);
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileAnalyticsSpend
    period={data.period}
    kpis={data.kpis}
    top_items={data.top_items}
    category_spend={data.category_spend}
  />
</div>

<div class="hidden md:block" style="height:100%;overflow:auto;">
  <div style="padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px;">

    <div style="display:flex;align-items:center;gap:12px;">
      <PeriodPills active={data.period} pills={PERIODS.map(([val, labelKey]) => ({ value: val, label: $t(labelKey), href: `?period=${val}` }))} />
      <div style="flex:1;"></div>
      <h2 style="margin:0;font-size:14px;font-weight:500;color:var(--mep-fg-3);">{$t('spend.question')}</h2>
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
        label={$t('spend.lineItems')}
        value={data.kpis.total_line_items}
        delta={data.kpis.line_items_delta_pct !== null ? Math.round(data.kpis.line_items_delta_pct * 10) / 10 : undefined}
        deltaCtx={data.kpis.line_items_delta_pct !== null ? $t('inv.kpi.vsPrev') : undefined}
        spark={data.kpis.line_items_spark ?? undefined}
        sparkPrev={data.kpis.line_items_spark_prev ?? undefined}
      />
      <KpiCard
        label={$t('spend.uniqueItems')}
        value={data.kpis.unique_items}
      />
      <KpiCard
        label={$t('spend.avgItems')}
        value={data.kpis.avg_invoice_items != null ? data.kpis.avg_invoice_items.toFixed(1) : '—'}
      />
    </div>

    <div style="display:grid;grid-template-columns:3fr 2fr;gap:12px;">

      <div class="card" style="padding:16px;">
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
          <div style="display:flex;gap:24px;align-items:center;">
            <div style="position:relative;flex-shrink:0;width:180px;height:180px;">
              <svg width="180" height="180" viewBox="0 0 180 180" style="overflow:visible;transform:rotate(-90deg);">
                {#each spendDonut.slices as slice, i}
                  {@const CIRC = 2 * Math.PI * 70}
                  {@const GAP = spendDonut.slices.length > 1 ? 2 : 0}
                  <circle cx="90" cy="90" r="70" fill="none"
                    stroke={slice.color}
                    stroke-width={hoveredSpendSlice === i ? 30 : 26}
                    stroke-dasharray="{Math.max(slice.dash - GAP, 0)} {CIRC - slice.dash + GAP}"
                    stroke-dashoffset={-slice.offset}
                    opacity={hoveredSpendSlice === null || hoveredSpendSlice === i ? 1 : 0.35}
                    style="cursor:pointer;transition:stroke-width 120ms,opacity 120ms;"
                    role="img"
                    aria-label="{slice.label}: {fmtEur(slice.spend)} ({(slice.pct * 100).toFixed(0)}%)"
                    onmouseenter={() => hoveredSpendSlice = i}
                    onmouseleave={() => hoveredSpendSlice = null} />
                {/each}
              </svg>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">
                {#if hoveredSpendSlice !== null && spendDonut.slices[hoveredSpendSlice]}
                  <span class="num" style="font-size:15px;font-weight:600;color:var(--mep-fg);">{(spendDonut.slices[hoveredSpendSlice].pct * 100).toFixed(0)}%</span>
                  <span style="font-size:10px;color:var(--mep-fg-3);max-width:120px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{spendDonut.slices[hoveredSpendSlice].label}</span>
                {:else}
                  <span class="num" style="font-size:15px;font-weight:600;color:var(--mep-fg);">{fmtEur(spendDonut.total)}</span>
                  <span style="font-size:10px;color:var(--mep-fg-3);">{$t('spend.totalSpend')}</span>
                {/if}
              </div>
            </div>

            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;">
              {#each spendDonut.slices as slice, i}
                <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:default;
                  background:{hoveredSpendSlice === i ? 'var(--mep-surface-2)' : 'transparent'};"
                  role="group" aria-label={slice.label}
                  onmouseenter={() => hoveredSpendSlice = i} onmouseleave={() => hoveredSpendSlice = null}>
                  <span style="width:9px;height:9px;border-radius:2px;background:{slice.color};flex-shrink:0;"></span>
                  <span style="font-size:12px;color:var(--mep-fg-2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title={slice.label}>
                    {slice.label}
                  </span>
                  <span class="num" style="font-size:11.5px;color:var(--mep-fg-3);flex-shrink:0;width:34px;text-align:right;">{(slice.pct * 100).toFixed(0)}%</span>
                  <span class="num" style="font-size:12px;font-weight:500;color:var(--mep-fg);flex-shrink:0;width:80px;text-align:right;">{fmtEur(slice.spend)}</span>
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
