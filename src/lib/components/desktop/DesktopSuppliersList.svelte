<script lang="ts">
  import { fmtEur, fmtDateShort, initials } from '$lib/formatters';
  import { locale, t, ti, tcat } from '$lib/i18n';
  import Search from '@lucide/svelte/icons/search';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Plus from '@lucide/svelte/icons/plus';
  import Sparkline from '$lib/components/PriceTrendSparkline.svelte';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import PeriodPills from '$lib/components/mep/PeriodPills.svelte';

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
    is_favorite?: boolean;
  }

  interface PeriodStats {
    total_spend: number;
    total_invoices: number;
    spend_delta_pct: number | null;
    invoices_delta_pct: number | null;
    spend_spark?: number[] | null;
    spend_spark_prev?: number[] | null;
    invoices_spark?: number[] | null;
    invoices_spark_prev?: number[] | null;
  }

  const PERIODS: Array<['day' | 'month' | 'year' | 'all', string]> = [
    ['day',   'inv.period.day'],
    ['month', 'inv.period.month'],
    ['year',  'inv.period.year'],
    ['all',   'inv.period.all'],
  ];

  let {
    suppliers,
    categories = [],
    period = 'month',
    periodStats = { total_spend: 0, total_invoices: 0, spend_delta_pct: null, invoices_delta_pct: null },
    unassigned = 0,
    firstUnassigned = '',
  }: {
    suppliers: Supplier[];
    categories?: string[];
    period?: 'day' | 'month' | 'year' | 'all';
    periodStats?: PeriodStats;
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

  <div style="display:flex;align-items:center;gap:12px;">
    <div class="search-field">
      <span class="search-icon"><Search size={14} /></span>
      <input class="input" placeholder={$t('sup.searchPlaceholder')} bind:value={search} />
    </div>
    <PeriodPills active={period} pills={PERIODS.map(([val, labelKey]) => ({ value: val, label: $t(labelKey), href: `?period=${val}` }))} />
  </div>

  <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 flex-shrink-0" data-coach="suppliers-main">
    <KpiCard
      label={$t('dsup.activeSuppliers')}
      value={suppliers.length}
      sub={$t('dsup.inTotal')}
    />
    <KpiCard
      label={$t('spend.totalSpend')}
      value={fmtEur(periodStats.total_spend)}
      sub={period === 'all' ? $t('inv.kpi.amountSub') : undefined}
      delta={periodStats.spend_delta_pct !== null ? Math.round(periodStats.spend_delta_pct * 10) / 10 : undefined}
      deltaCtx={periodStats.spend_delta_pct !== null ? $t('inv.kpi.vsPrev') : undefined}
      spark={periodStats.spend_spark ?? undefined}
      sparkPrev={periodStats.spend_spark_prev ?? undefined}
      invert
    />
    <KpiCard
      label={$t('nav.invoices')}
      value={periodStats.total_invoices}
      sub={period === 'all' ? $t('inv.kpi.totalSub') : undefined}
      delta={periodStats.invoices_delta_pct !== null ? Math.round(periodStats.invoices_delta_pct * 10) / 10 : undefined}
      deltaCtx={periodStats.invoices_delta_pct !== null ? $t('inv.kpi.vsPrev') : undefined}
      spark={periodStats.invoices_spark ?? undefined}
      sparkPrev={periodStats.invoices_spark_prev ?? undefined}
    />
    <KpiCard
      label={$t('dsup.unassigned')}
      value={unassigned}
      variant={unassigned > 0 ? 'warn' : 'default'}
      sub={unassigned === 0 ? $t('dsup.allAssigned') : unassigned === 1 ? firstUnassigned : $ti('dsup.nSuppliers', { n: unassigned })}
    />
  </div>

  <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
    <div style="position:relative;">
      <select class="btn btn-secondary"
        style="height:32px;font-size:12.5px;appearance:none;padding:0 28px 0 10px;cursor:pointer;min-width:130px;"
        bind:value={catFilter}>
        <option value="">{$t('sup.filterAllCategories')}</option>
        {#each categories as cat}
          <option value={cat}>{$tcat(cat)}</option>
        {/each}
      </select>
      <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mep-fg-3);font-size:10px;">▾</span>
    </div>
    <div style="flex:1;"></div>
    <button class="btn btn-secondary"
      style="height:32px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;opacity:0.5;cursor:not-allowed;" disabled
      title={$t('dsup.addSupplier.auto')}>
      <Plus size={13} /> {$t('dsup.addSupplier')}
    </button>
  </div>

  <div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:column;">
    <div class="card-header" style="flex-shrink:0;">
      <div class="section-title">
        <span class="subtitle">{$t('dsup.list.title')}</span>
        <span class="body" style="font-size:12px;">{$t('dsup.list.sub')}</span>
      </div>
    </div>
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
                    {#if s.is_favorite}
                      <span style="
                        flex-shrink:0;font-size:9px;font-weight:700;
                        background:var(--mep-pos-soft,var(--mep-acc-soft));color:var(--mep-pos,var(--mep-acc));
                        padding:1px 5px;border-radius:999px;letter-spacing:0.03em;
                      ">{$t('sup.favoriteBadge')}</span>
                    {/if}
                  </div>
                </td>
                <td style="font-size:12px;color:var(--mep-fg-3);">{s.cif ?? '—'}</td>
                <td>
                  <span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;
                    color:{s.category === 'Other' ? 'var(--mep-fg-3)' : 'var(--mep-fg-2)'};
                    font-style:{s.category === 'Other' ? 'italic' : 'normal'};">
                    <span class="swatch" style="background:{s.color};"></span>
                    {$tcat(s.category)}
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
