<script lang="ts">
  import type { PageData } from './$types';
  import { categoryColor, categoryTint } from '$lib/colors';
  import { untrack } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fmtEur, fmtDateShort, initials } from '$lib/formatters';
  import { locale, t, ti, tcat } from '$lib/i18n';
  import ListPageTemplate from '$lib/components/mep/ListPageTemplate.svelte';
  import MobileSuppliersList from '$lib/components/mobile/MobileSuppliersList.svelte';
  import Sparkline from '$lib/components/PriceTrendSparkline.svelte';
  import { PERIOD_PILLS } from '$lib/constants';
  import {
    SUPPLIER_SEARCH_DEBOUNCE_MS,
    SUPPLIER_SORT_KEYS,
    SUPPLIER_SORT_LABEL_KEYS,
  } from '$lib/supplier-list';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Plus from '@lucide/svelte/icons/plus';

  let { data }: { data: PageData } = $props();

  const totalSpend         = $derived(data.suppliers.reduce((s, x) => s + (x.month_spend ?? 0), 0));
  const totalMonthInvoices = $derived(data.suppliers.reduce((s, x) => s + (x.month_invoice_count ?? 0), 0));
  const unassigned         = $derived(data.suppliers.filter(s => !s.category || s.category === 'Other').length);
  const firstUnassigned    = $derived(data.suppliers.find(s => !s.category || s.category === 'Other')?.name ?? '');
  const hasFilters         = $derived(Boolean(data.search || data.category || data.uncategorizedOnly || data.badge));

  const unassignedSub = $derived.by(() => {
    if (unassigned === 0) return $t('dsup.allAssigned');
    if (unassigned === 1) return firstUnassigned;
    return $ti('dsup.nSuppliers', { n: unassigned });
  });

  let view    = $state<'list' | 'chart'>('list');
  let showAdd = $state(false);

  function listUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams($page.url.searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    const qs = params.toString();
    return qs ? `/suppliers?${qs}` : '/suppliers';
  }

  function applyFilters(patch: Record<string, string | null>, replace = false) {
    goto(listUrl(patch), { keepFocus: true, noScroll: true, replaceState: replace });
  }

  let search = $state(untrack(() => data.search));

  $effect(() => {
    const value = search.trim();
    if (value === data.search) return;
    const timer = setTimeout(() => applyFilters({ q: value || null }, true), SUPPLIER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  const periodPills = $derived(PERIOD_PILLS.map(p => {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('period', p.value);
    return { value: p.value, label: $t(p.labelKey), href: `/suppliers?${params.toString()}` };
  }));

  let trendSelection = $state<string[]>([]);
  const activeTrendKeys = $derived(
    trendSelection.length ? trendSelection : data.trendData.series.map(s => s.key)
  );
  function toggleTrendBadge(key: string) {
    trendSelection = activeTrendKeys.includes(key)
      ? activeTrendKeys.filter(k => k !== key)
      : [...activeTrendKeys, key];
  }
  const trendSeries = $derived(
    data.trendData.series
      .filter(s => activeTrendKeys.includes(s.key))
      .map(s => ({ key: s.key, label: s.label, color: categoryColor(s.key), values: s.values }))
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  function isNew(createdAt: Date | null) {
    return createdAt ? new Date(createdAt) >= thirtyDaysAgo : false;
  }
  function deltaColor(v: number) { return v > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)'; }
  function deltaArrow(v: number) {
    if (v > 0.05) return '↑';
    if (v < -0.05) return '↓';
    return '·';
  }
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileSuppliersList
    suppliers={data.suppliers}
    categories={data.categories}
    categoryCounts={data.categoryCounts}
    search={data.search}
    category={data.category}
    sort={data.sort}
    uncategorizedOnly={data.uncategorizedOnly}
    onApply={applyFilters}
    {totalSpend}
    {totalMonthInvoices}
    {unassigned}
    {firstUnassigned}
  />
</div>

<div class="hidden md:block p-6">
  <ListPageTemplate
    dataCoach="suppliers-main"
    bind:search
    bind:view
    searchPlaceholder={$t('sup.searchPlaceholder')}
    period={data.period}
    {periodPills}
    viewLabels={{ list: $t('tpl.view.list'), chart: $t('tpl.view.chart') }}
    kpis={[
      { key: 'count',     label: $t('dsup.activeSuppliers'), value: data.suppliers.length, sub: $t('dsup.inTotal') },
      { key: 'spend',     label: $t('spend.totalSpend'),     value: fmtEur(totalSpend),     sub: $t('dash.category.sub') },
      { key: 'invoices',  label: $t('nav.invoices'),         value: totalMonthInvoices,     sub: $t('dash.category.sub') },
      { key: 'unassigned',label: $t('dsup.unassigned'),      value: unassigned, sub: unassignedSub, variant: unassigned > 0 ? 'warn' : 'default' },
    ]}
    trendTitle={$t('sup.trend.title')}
    trendBadges={data.trendData.series.map(s => ({ key: s.key, label: s.label, color: categoryColor(s.key), active: activeTrendKeys.includes(s.key) }))}
    onToggleTrendBadge={toggleTrendBadge}
    trendXLabels={data.trendData.xLabels}
    {trendSeries}
    trendValueFormatter={fmtEur}
    trendEmptyLabel={$t('tpl.trend.empty')}
  >
    {#snippet filters()}
      <div style="position:relative;">
        <select class="btn btn-secondary"
          style="appearance:none;padding:0 28px 0 10px;cursor:pointer;min-width:130px;"
          aria-label={$t('sup.filterAllCategories')}
          value={data.category}
          onchange={(e) => applyFilters({ category: e.currentTarget.value || null })}>
          <option value="">{$t('sup.filterAllCategories')}</option>
          {#each data.categories as cat}
            <option value={cat}>{$tcat(cat)}</option>
          {/each}
        </select>
        <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mep-fg-3);font-size:11px;">▾</span>
      </div>

      <div style="position:relative;">
        <select class="btn btn-secondary"
          style="appearance:none;padding:0 28px 0 10px;cursor:pointer;min-width:190px;"
          aria-label={$t('sup.sort.label')}
          value={data.sort}
          onchange={(e) => applyFilters({ sort: e.currentTarget.value })}>
          {#each SUPPLIER_SORT_KEYS as key}
            <option value={key}>{$t(SUPPLIER_SORT_LABEL_KEYS[key])}</option>
          {/each}
        </select>
        <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mep-fg-3);font-size:11px;">▾</span>
      </div>

      <button type="button" class="btn btn-secondary max-[1050px]:hidden"
        aria-pressed={data.uncategorizedOnly}
        style="font-size:12.5px;white-space:nowrap;flex-shrink:0;
          border-color:{data.uncategorizedOnly ? 'var(--mep-acc)' : 'var(--mep-border)'};
          color:{data.uncategorizedOnly ? 'var(--mep-acc)' : 'var(--mep-fg-2)'};"
        onclick={() => applyFilters({ uncategorized: data.uncategorizedOnly ? null : '1' })}>
        {$t('sup.filterUncategorized')}
      </button>

      <div class="max-[1050px]:hidden" style="position:relative;">
        <select class="btn btn-secondary"
          style="appearance:none;padding:0 28px 0 10px;cursor:pointer;min-width:160px;"
          aria-label={$t('dsup.activityAll')}
          value={data.badge}
          onchange={(e) => applyFilters({ badge: e.currentTarget.value || null })}>
          <option value="">{$t('dsup.activityAll')}</option>
          <option value="overdue">{$t('status.overdue')}</option>
          <option value="due_soon">{$t('status.due_soon')}</option>
          <option value="paid_up">{$t('status.paid')}</option>
        </select>
        <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mep-fg-3);font-size:11px;">▾</span>
      </div>

      <div style="flex:1;"></div>
      <button class="btn btn-secondary"
        style="font-size:12.5px;display:inline-flex;align-items:center;gap:6px;"
        onclick={() => showAdd = true}>
        <Plus size={13} /> {$t('dsup.addSupplier')}
      </button>
    {/snippet}

    {#snippet table()}
      {#if !data.suppliers.length}
        <div style="text-align:center;padding:48px 24px;display:flex;flex-direction:column;align-items:center;gap:8px;">
          {#if hasFilters}
            <p class="body" style="color:var(--mep-fg-3);">{$t('sup.noResults')}</p>
          {:else}
            <div style="font-size:28px;margin-bottom:4px;opacity:0.3;">🏪</div>
            <p class="body-strong" style="color:var(--mep-fg-2);">{$t('sup.emptyTitle')}</p>
            <p class="body" style="color:var(--mep-fg-3);max-width:320px;">{$t('sup.emptyDesc')}</p>
            <a href="/" class="btn btn-primary" style="height:34px;font-size:13px;text-decoration:none;margin-top:8px;">{$t('action.upload')}</a>
          {/if}
        </div>
      {:else}
        <div style="overflow-x:auto;">
          <table class="tbl" style="table-layout:fixed;">
            <thead>
              <tr>
                <th style="width:24%;">{$t('tbl.supplier')}</th>
                <th style="width:100px;">{$t('sup.field.cif')}</th>
                <th style="width:120px;">{$t('sup.field.category')}</th>
                <th class="num" style="width:75px;">{$t('nav.invoices')}</th>
                <th class="num" style="width:115px;">{$t('tbl.spendMonth')}</th>
                <th class="num" style="width:115px;">{$t('tbl.spendTotal')}</th>
                <th style="width:90px;">{$t('tbl.trend')}</th>
                <th class="num" style="width:65px;">Δ</th>
                <th style="width:100px;">{$t('tbl.lastOrder')}</th>
                <th style="width:32px;"></th>
              </tr>
            </thead>
            <tbody>
              {#each data.suppliers as s (s.id)}
                <tr class="row" onclick={() => location.replace(`/suppliers/${s.id}`)} style="cursor:pointer;">
                  <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="
                        width:28px;height:28px;border-radius:14px;flex-shrink:0;
                        background:{categoryTint(s.category)};color:{categoryColor(s.category)};
                        display:inline-flex;align-items:center;justify-content:center;
                        font-size:11px;font-weight:600;
                      ">{initials(s.name)}</span>
                      <span style="font-size:13px;font-weight:500;color:var(--mep-fg);
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{s.name}</span>
                      {#if isNew(s.createdAt)}
                        <span style="
                          flex-shrink:0;font-size:11px;font-weight:700;
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
                      <span class="swatch" style="background:{categoryColor(s.category)};"></span>
                      {$tcat(s.category)}
                    </span>
                  </td>
                  <td class="num" style="font-size:12.5px;color:var(--mep-fg-2);">{s.invoice_count}</td>
                  <td class="num" style="font-weight:500;">{fmtEur(s.month_spend ?? 0)}</td>
                  <td class="num" style="font-size:12.5px;color:var(--mep-fg-2);">{fmtEur(s.total_spend ?? 0)}</td>
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
        </div>
      {/if}
    {/snippet}
  </ListPageTemplate>
</div>

{#if showAdd}
  <div style="position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);"
    role="dialog" aria-modal="true" tabindex="-1"
    onclick={() => showAdd = false}
    onkeydown={(e) => { if (e.key === 'Escape') showAdd = false; }}>
    <div class="card" style="width:360px;padding:24px;display:flex;flex-direction:column;gap:16px;"
      role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <p class="body-strong" style="font-size:16px;margin:0;">{$t('dsup.addSupplier')}</p>
      <form method="POST" action="?/create" style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label class="label" for="sup-name">{$t('tbl.supplier')}</label>
          <input id="sup-name" name="name" class="input" required
            style="height:36px;" />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label class="label" for="sup-cat">{$t('sup.field.category')}</label>
          <select id="sup-cat" name="category" class="input" style="height:36px;">
            <option value="">—</option>
            {#each data.categories as cat}
              <option value={cat}>{$tcat(cat)}</option>
            {/each}
          </select>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
          <button type="button" class="btn btn-secondary" style="height:34px;font-size:13px;"
            onclick={() => showAdd = false}>{$t('action.cancel')}</button>
          <button type="submit" class="btn btn-primary" style="height:34px;font-size:13px;">{$t('set.save')}</button>
        </div>
      </form>
    </div>
  </div>
{/if}
