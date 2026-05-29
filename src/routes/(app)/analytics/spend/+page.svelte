<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import MobileAnalyticsSpend from '$lib/components/mobile/MobileAnalyticsSpend.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';

  let { data }: { data: PageData } = $props();

  const periods: Array<[string, string]> = [
    ['month',   '30 d'],
    ['quarter', '90 d'],
    ['half',    '6 m'],
    ['all',     'Todo'],
  ];

  function fmtEur(n: number | null | undefined) {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0) + ' €';
  }
</script>

<!-- Mobile spend analytics -->
<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileAnalyticsSpend
    period={data.period}
    kpis={data.kpis}
    top_items={data.top_items}
    category_spend={data.category_spend}
  />
</div>

<!-- Desktop spend analytics -->
<div class="max-md:hidden" style="height:100%;overflow:auto;">
  <div style="padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px;">

    <!-- Header + period picker -->
    <div style="display:flex;align-items:center;gap:12px;">
      <h2 style="margin:0;font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">¿Dónde va el dinero?</h2>
      <div style="flex:1;"></div>
      <div style="display:flex;gap:0;background:var(--mep-surface-2);border-radius:6px;padding:2px;border:1px solid var(--mep-divider);">
        {#each periods as [val, short]}
          <a href="?period={val}" style="
            background:{data.period === val ? 'var(--mep-surface)' : 'transparent'};
            color:{data.period === val ? 'var(--mep-fg)' : 'var(--mep-fg-3)'};
            font-size:12px;font-weight:{data.period === val ? 500 : 400};
            padding:5px 12px;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block;
            box-shadow:{data.period === val ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'};
            font-family:inherit;
          ">{short}</a>
        {/each}
      </div>
    </div>

    <!-- KPI row -->
    <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
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

    <!-- Charts row -->
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:12px;">

      <!-- Top items -->
      <div class="card" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{$t('spend.topItems')}</div>
        <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">Top productos por gasto en el período</div>
        {#if !data.top_items.length}
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 0;text-align:center;">
            <div style="font-size:24px;opacity:0.25;">📊</div>
            <p class="body-strong" style="color:var(--mep-fg-3);">Sin datos aún</p>
            <p class="body" style="color:var(--mep-fg-4);font-size:12px;max-width:240px;">Los análisis aparecen una vez que tengas facturas confirmadas.</p>
            <a href="/" style="font-size:12px;color:var(--mep-acc);text-decoration:none;margin-top:4px;">Subir primera factura →</a>
          </div>
        {:else}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each data.top_items.slice(0, 10) as item}
              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;gap:8px;">
                  <span style="font-size:12.5px;font-weight:500;color:var(--mep-fg);
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;"
                    title={item.description}>{item.description}</span>
                  {#if item.price_trend && item.price_trend.length >= 2}
                    <Sparkline values={item.price_trend} width={64} height={20} />
                  {/if}
                  <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);flex-shrink:0;">
                    {fmtEur(item.total_spend)}
                  </span>
                </div>
                <div style="height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:hidden;">
                  <div style="width:{item.pct}%;height:100%;background:var(--mep-acc);border-radius:4px;"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- By category -->
      <div class="card" style="padding:16px;">
        <div class="subtitle" style="margin-bottom:4px;">{$t('spend.byCategory')}</div>
        <div style="font-size:12px;color:var(--mep-fg-3);margin-bottom:16px;">Gasto por categoría de proveedor</div>
        {#if !data.category_spend.length}
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 0;text-align:center;">
            <p class="body" style="color:var(--mep-fg-4);font-size:12px;max-width:200px;">Asigna categorías a tus proveedores para ver el desglose.</p>
            <a href="/suppliers" style="font-size:12px;color:var(--mep-acc);text-decoration:none;">Ver proveedores →</a>
          </div>
        {:else}
          <div style="display:flex;flex-direction:column;gap:10px;">
            {#each data.category_spend as cat}
              <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                  <span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--mep-fg-2);">
                    <span style="width:10px;height:10px;border-radius:2px;background:{cat.color};display:inline-block;flex-shrink:0;"></span>
                    {cat.category}
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
