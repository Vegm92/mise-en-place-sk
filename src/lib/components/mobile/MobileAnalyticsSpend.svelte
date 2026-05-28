<script lang="ts">
  import MobilePageHeader from './MobilePageHeader.svelte';

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
  }
  interface CategorySpend {
    category: string;
    total: number;
    pct: number;
    color: string;
  }

  let {
    period,
    kpis,
    top_items,
    category_spend,
  }: {
    period: string;
    kpis: Kpis;
    top_items: TopItem[];
    category_spend: CategorySpend[];
  } = $props();

  const periods: Array<[string, string]> = [
    ['month', '30 d'],
    ['quarter', '90 d'],
    ['half', '6 m'],
    ['all', 'Todo'],
  ];

  function fmtEur(n: number | null | undefined) {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0) + ' €';
  }
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
  <MobilePageHeader title="Gasto" />

  <div style="flex: 1; overflow: auto; padding: 0 18px 90px; display: flex; flex-direction: column; gap: 14px;">

    <!-- Period picker chips -->
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

    <!-- KPI 2-col grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">Gasto total</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {fmtEur(kpis?.total_items_spend)}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">Líneas</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.total_line_items ?? '—'}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">Productos únicos</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.unique_items ?? '—'}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">Media por factura</div>
        <div class="num" style="font-size: 20px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.4px; line-height: 1.1;">
          {kpis?.avg_invoice_items != null ? kpis.avg_invoice_items.toFixed(1) : '—'}
        </div>
      </div>
    </div>

    <!-- Top items -->
    {#if top_items?.length > 0}
      <div class="card" style="padding: 14px 14px 6px;">
        <div class="subtitle" style="font-size: 15px; margin-bottom: 12px;">Top productos</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          {#each top_items.slice(0, 10) as item}
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="font-size: 12.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;"
                  title={item.description}>{item.description}</span>
                <span class="num" style="font-size: 12.5px; font-weight: 500; color: var(--mep-fg); flex-shrink: 0; margin-left: 8px;">
                  {fmtEur(item.total_spend)}
                </span>
              </div>
              <div style="height: 6px; border-radius: 3px; background: var(--mep-surface-2); overflow: hidden;">
                <div style="width: {item.pct}%; height: 100%; background: var(--mep-acc); border-radius: 3px;"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- By category -->
    {#if category_spend?.length > 0}
      <div class="card" style="padding: 14px 14px 6px;">
        <div class="subtitle" style="font-size: 15px; margin-bottom: 12px;">Por categoría</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          {#each category_spend as cat}
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--mep-fg-2);">
                  <span style="width: 10px; height: 10px; border-radius: 2px; background: {cat.color}; display: inline-block; flex-shrink: 0;"></span>
                  {cat.category}
                </span>
                <span class="num" style="font-size: 12.5px; font-weight: 500; color: var(--mep-fg);">{fmtEur(cat.total)}</span>
              </div>
              <div style="height: 6px; border-radius: 3px; background: var(--mep-surface-2); overflow: hidden;">
                <div style="width: {cat.pct}%; height: 100%; background: {cat.color}; border-radius: 3px;"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  </div>
</div>
