<script lang="ts">
  import { t, tcat, tp } from '$lib/i18n';

  import { categoryColor, seriesColor, SERIES_OTHER } from '$lib/colors';
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

  let {
    period,
    kpis,
    top_items,
    category_spend,
    has_invoices,
    invoices_outside_range,
  }: {
    period: string;
    kpis: Kpis;
    top_items: TopItem[];
    category_spend: CategorySpend[];
    has_invoices: boolean;
    invoices_outside_range: number;
  } = $props();

  const periods: Array<[string, string]> = [
    ['month', '30 d'],
    ['quarter', '90 d'],
    ['half', '6 m'],
    ['all', $t('spend.period.allShort')],
  ];

  function fmtEur(n: number | null | undefined) {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0) + ' €';
  }

  const spendDonut = $derived((() => {
    const ranked = [...top_items].sort((a, b) => b.total_spend - a.total_spend);
    const total = ranked.reduce((a, p) => a + p.total_spend, 0);
    if (total <= 0) return { slices: [], total: 0 };

    const top = ranked.slice(0, 5);
    const rest = ranked.slice(5);
    const restSpend = rest.reduce((a, p) => a + p.total_spend, 0);

    const entries = top.map((p, i) => ({ label: p.description, spend: p.total_spend, color: seriesColor(i) }));
    if (restSpend > 0) entries.push({ label: $t('spend.other'), spend: restSpend, color: SERIES_OTHER });

    let cursor = 0;
    const CIRC = 2 * Math.PI * 60;
    const slices = entries.map(e => {
      const pct = e.spend / total;
      const dash = pct * CIRC;
      const slice = { ...e, pct, dash, offset: cursor };
      cursor += dash;
      return slice;
    });
    return { slices, total };
  })());
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
        <div class="label" style=" margin-bottom: 5px;">{$t('spend.totalSpend')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {fmtEur(kpis?.total_items_spend)}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{$t('tbl.lines')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.total_line_items ?? '—'}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{$t('spend.uniqueItems')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.unique_items ?? '—'}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{$t('spend.avgItems')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.avg_invoice_items != null ? kpis.avg_invoice_items.toFixed(1) : '—'}
        </div>
      </div>
    </div>

    <div class="card" style="padding: 14px;">
      <div class="subtitle" style="font-size: 15px; margin-bottom: 2px;">{$t('spend.topProducts')}</div>
      <div style="font-size: 11px; color: var(--mep-fg-3); margin-bottom: 12px;">{$t('spend.topItemsSub')}</div>
      {#if !top_items?.length && has_invoices && invoices_outside_range > 0}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 0; text-align: center;">
          <div style="font-size: 24px; opacity: 0.25;">📅</div>
          <p class="body-strong" style="color: var(--mep-fg-3); margin: 0;">{$t('spend.noneInRange')}</p>
          <p class="body" style="color: var(--mep-fg-4); font-size: 13px; max-width: 240px; margin: 0;">{$tp('spend.noneInRangeHint', invoices_outside_range)}</p>
          <a href="?period=all" style="font-size: 13px; color: var(--mep-acc); text-decoration: none; display: inline-flex; align-items: center; min-height: 44px;">{$t('spend.widenRange')}</a>
        </div>
      {:else if !top_items?.length}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 0; text-align: center;">
          <div style="font-size: 24px; opacity: 0.25;">📊</div>
          <p class="body-strong" style="color: var(--mep-fg-3); margin: 0;">{$t('spend.noDataYet')}</p>
          <p class="body" style="color: var(--mep-fg-4); font-size: 13px; max-width: 240px; margin: 0;">{$t('spend.emptyHint')}</p>
          <a href="/" style="font-size: 13px; color: var(--mep-acc); text-decoration: none; display: inline-flex; align-items: center; min-height: 44px;">{$t('spend.uploadFirst')}</a>
        </div>
      {:else}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 14px;">
          <div style="position: relative; width: 156px; height: 156px;">
            <svg width="156" height="156" viewBox="0 0 156 156" style="overflow:visible;transform:rotate(-90deg);">
              {#each spendDonut.slices as slice}
                {@const CIRC = 2 * Math.PI * 60}
                {@const GAP = spendDonut.slices.length > 1 ? 2 : 0}
                <circle cx="78" cy="78" r="60" fill="none"
                  stroke={slice.color} stroke-width="22"
                  stroke-dasharray="{Math.max(slice.dash - GAP, 0)} {CIRC - slice.dash + GAP}"
                  stroke-dashoffset={-slice.offset}
                  role="img" aria-label="{slice.label}: {fmtEur(slice.spend)} ({(slice.pct * 100).toFixed(0)}%)" />
              {/each}
            </svg>
            <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <span class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">{fmtEur(spendDonut.total)}</span>
              <span style="font-size: 11px; color: var(--mep-fg-3);">{$t('spend.totalSpend')}</span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 7px; width: 100%;">
            {#each spendDonut.slices as slice}
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 9px; height: 9px; border-radius: 2px; background: {slice.color}; flex-shrink: 0;"></span>
                <span style="font-size: 12px; color: var(--mep-fg-2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{slice.label}</span>
                <span class="num" style="font-size: 11px; color: var(--mep-fg-3); flex-shrink: 0;">{(slice.pct * 100).toFixed(0)}%</span>
                <span class="num" style="font-size: 12px; font-weight: 500; color: var(--mep-fg); flex-shrink: 0; width: 70px; text-align: right;">{fmtEur(slice.spend)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="card" style="padding: 14px 14px 6px;">
      <div class="subtitle" style="font-size: 15px; margin-bottom: 2px;">{$t('spend.byCategory')}</div>
      <div style="font-size: 11px; color: var(--mep-fg-3); margin-bottom: 12px;">{$t('spend.byCategorySub')}</div>
      {#if !category_spend?.length}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 0 20px; text-align: center;">
          <p class="body" style="color: var(--mep-fg-4); font-size: 13px; max-width: 220px; margin: 0;">{$t('spend.assignCategories')}</p>
          <a href="/suppliers" style="font-size: 13px; color: var(--mep-acc); text-decoration: none; display: inline-flex; align-items: center; min-height: 44px;">{$t('spend.viewSuppliers')}</a>
        </div>
      {:else}
        <div style="display: flex; flex-direction: column; gap: 10px;">
          {#each category_spend as cat}
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--mep-fg-2);">
                  <span style="width: 10px; height: 10px; border-radius: 2px; background: {categoryColor(cat.category)}; display: inline-block; flex-shrink: 0;"></span>
                  {$tcat(cat.category)}
                </span>
                <span class="num" style="font-size: 12.5px; font-weight: 500; color: var(--mep-fg);">{fmtEur(cat.total)}</span>
              </div>
              <div style="height: 6px; border-radius: 3px; background: var(--mep-surface-2); overflow: hidden;">
                <div style="width: {cat.pct}%; height: 100%; background: {categoryColor(cat.category)}; border-radius: 3px;"></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div>
</div>
