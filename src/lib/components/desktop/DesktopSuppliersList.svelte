<script lang="ts">
  import { fmtEur, fmtDateShort, initials } from '$lib/formatters';
  import { locale, t, ti } from '$lib/i18n';
  import Search from '@lucide/svelte/icons/search';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Plus from '@lucide/svelte/icons/plus';
  import Sparkline from '$lib/components/PriceTrendSparkline.svelte';

  interface Supplier {
    id: number;
    name: string;
    color: string | null;
    category: string | null;
    cif: string | null;
    invoice_count: number;
    month_spend: number | null;
    delta_pct: number | null;
    last_invoice_date: string | null;
    createdAt: Date | null;
    month_invoice_count: number | null;
    price_trend?: number[];
  }

  let {
    suppliers,
    categories = [],
    totalSpend = 0,
    totalMonthInvoices = 0,
    unassigned = 0,
    firstUnassigned = '',
  }: {
    suppliers: Supplier[];
    categories?: string[];
    totalSpend?: number;
    totalMonthInvoices?: number;
    unassigned?: number;
    firstUnassigned?: string;
  } = $props();

  let search    = $state('');
  let catFilter = $state('');

  const filtered = $derived(
    suppliers.filter(s => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q);
      const matchCat = !catFilter || s.category === catFilter;
      return matchSearch && matchCat;
    })
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  function isNew(createdAt: Date | null) {
    return createdAt ? new Date(createdAt) >= thirtyDaysAgo : false;
  }

  function deltaColor(v: number) { return v > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)'; }
  function deltaArrow(v: number) { return v > 0.05 ? '↑' : v < -0.05 ? '↓' : '·'; }
</script>

<div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0;">

  <!-- Filter bar -->
  <div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
    <div style="position:relative;flex:1;min-width:180px;">
      <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--mep-fg-3);">
        <Search size={14} />
      </span>
      <input class="input" style="padding-left:32px;width:100%;"
        placeholder={$t('sup.searchPlaceholder')} bind:value={search} />
    </div>
    <div style="position:relative;">
      <select class="btn btn-secondary"
        style="height:32px;font-size:12.5px;appearance:none;padding:0 28px 0 10px;cursor:pointer;min-width:130px;"
        bind:value={catFilter}>
        <option value="">{$t('sup.filterAllCategories')}</option>
        {#each categories as cat}
          <option value={cat}>{cat}</option>
        {/each}
      </select>
      <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mep-fg-3);font-size:10px;">▾</span>
    </div>
    <button class="btn btn-secondary max-[1050px]:hidden"
      style="height:32px;font-size:12.5px;opacity:0.55;cursor:default;white-space:nowrap;flex-shrink:0;" disabled>
      {$t('dsup.activityFilter')} <span style="font-size:10px;margin-left:2px;">▾</span>
    </button>
    <div style="flex:1;"></div>
    <button class="btn btn-secondary"
      style="height:32px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;opacity:0.5;cursor:not-allowed;" disabled>
      <Plus size={13} /> {$t('dsup.addSupplier')}
    </button>
  </div>

  <!-- Summary strip -->
  <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 flex-shrink-0">
    <div class="card" style="padding:14px;">
      <div class="label" style="margin-bottom:6px;">{$t('dsup.activeSuppliers')}</div>
      <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{suppliers.length}</div>
      <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{$t('dsup.inTotal')}</div>
    </div>
    <div class="card" style="padding:14px;">
      <div class="label" style="margin-bottom:6px;">{$t('spend.totalSpend')}</div>
      <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{fmtEur(totalSpend)}</div>
      <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{$t('dash.category.sub')}</div>
    </div>
    <div class="card" style="padding:14px;">
      <div class="label" style="margin-bottom:6px;">{$t('nav.invoices')}</div>
      <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{totalMonthInvoices}</div>
      <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{$t('dash.category.sub')}</div>
    </div>
    <div class="card" style="padding:14px;">
      <div class="label" style="margin-bottom:6px;">{$t('dsup.unassigned')}</div>
      <div class="num" style="font-size:22px;font-weight:600;color:{unassigned > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};letter-spacing:-0.4px;line-height:1.1;">{unassigned}</div>
      <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        {#if unassigned === 0}{$t('dsup.allAssigned')}
        {:else if unassigned === 1}{firstUnassigned}
        {:else}{$ti('dsup.nSuppliers', { n: unassigned })}
        {/if}
      </div>
    </div>
  </div>

  <!-- Table -->
  <div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:column;">
    <div style="overflow:auto;flex:1;">
      {#if !filtered.length}
        <div style="text-align:center;padding:48px 24px;display:flex;flex-direction:column;align-items:center;gap:8px;">
          {#if search || catFilter}
            <p class="body" style="color:var(--mep-fg-3);">{$t('sup.noResults')}</p>
          {:else}
            <div style="font-size:28px;margin-bottom:4px;opacity:0.3;">🏪</div>
            <p class="body-strong" style="color:var(--mep-fg-2);">{$t('sup.emptyTitle')}</p>
            <p class="body" style="color:var(--mep-fg-3);max-width:320px;">{$t('sup.emptyDesc')}</p>
            <a href="/" class="btn btn-primary" style="height:34px;font-size:13px;text-decoration:none;margin-top:8px;">{$t('action.upload')}</a>
          {/if}
        </div>
      {:else}
        <table class="tbl" style="table-layout:fixed;">
          <thead>
            <tr>
              <th style="width:28%;">{$t('tbl.supplier')}</th>
              <th style="width:100px;">{$t('sup.field.cif')}</th>
              <th style="width:120px;">{$t('sup.field.category')}</th>
              <th class="num" style="width:75px;">{$t('nav.invoices')}</th>
              <th class="num" style="width:115px;">{$t('tbl.spendMonth')}</th>
              <th style="width:90px;">{$t('tbl.trend')}</th>
              <th class="num" style="width:65px;">Δ</th>
              <th style="width:100px;">{$t('tbl.lastOrder')}</th>
              <th style="width:32px;"></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as s (s.id)}
              <tr class="row" onclick={() => location.replace(`/suppliers/${s.id}`)} style="cursor:pointer;">
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span style="
                      width:28px;height:28px;border-radius:14px;flex-shrink:0;
                      background:{s.color}24;color:{s.color};
                      display:inline-flex;align-items:center;justify-content:center;
                      font-size:11px;font-weight:600;
                    ">{initials(s.name)}</span>
                    <span style="font-size:13px;font-weight:500;color:var(--mep-fg);
                      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{s.name}</span>
                    {#if isNew(s.createdAt)}
                      <span style="
                        flex-shrink:0;font-size:9px;font-weight:700;
                        background:var(--mep-acc-soft);color:var(--mep-acc);
                        padding:1px 5px;border-radius:999px;letter-spacing:0.03em;
                      ">{$t('dsup.newBadge')}</span>
                    {/if}
                  </div>
                </td>
                <td style="font-size:12px;color:var(--mep-fg-3);">{s.cif ?? '—'}</td>
                <td>
                  <span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;
                    color:{s.category === 'Other' ? 'var(--mep-fg-3)' : 'var(--mep-fg-2)'};
                    font-style:{s.category === 'Other' ? 'italic' : 'normal'};">
                    <span class="swatch" style="background:{s.color};"></span>
                    {s.category === 'Other' ? 'Sin categoría' : (s.category ?? 'Sin categoría')}
                  </span>
                </td>
                <td class="num" style="font-size:12.5px;color:var(--mep-fg-2);">{s.invoice_count}</td>
                <td class="num" style="font-weight:500;">{fmtEur(s.month_spend ?? 0)}</td>
                <td style="padding:0 8px;">
                  {#if s.price_trend && s.price_trend.length >= 3}
                    <Sparkline values={s.price_trend} width={80} height={24} />
                  {:else}
                    <span style="font-size:11.5px;color:var(--mep-fg-3);">—</span>
                  {/if}
                </td>
                <td class="num">
                  {#if s.delta_pct === null || Math.abs(s.delta_pct) < 0.1}
                    <span style="font-size:11.5px;color:var(--mep-fg-3);">—</span>
                  {:else}
                    <span style="font-size:12px;font-weight:500;color:{deltaColor(s.delta_pct)};
                      display:inline-flex;align-items:center;gap:2px;">
                      <span style="font-size:11px;">{deltaArrow(s.delta_pct)}</span>
                      {Math.abs(s.delta_pct).toFixed(1).replace('.', ',')}%
                    </span>
                  {/if}
                </td>
                <td class="num" style="font-size:12.5px;color:var(--mep-fg-2);">{fmtDateShort(s.last_invoice_date, $locale)}</td>
                <td style="text-align:right;">
                  <ChevronRight size={13} style="color:var(--mep-fg-3);" />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>

</div>
