<script lang="ts">
  import { untrack } from 'svelte';
  import { categoryColor, categoryTint } from '$lib/colors';
  import { fmtEur } from '$lib/formatters';
  import { locale, t, tcat, ti } from '$lib/i18n';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Sparkline from '$lib/components/PriceTrendSparkline.svelte';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';
  import {
    DEFAULT_SUPPLIER_SORT,
    SUPPLIER_SEARCH_DEBOUNCE_MS,
    SUPPLIER_SORT_KEYS,
    SUPPLIER_SORT_LABEL_KEYS,
    type SupplierSortKey,
  } from '$lib/supplier-list';

  interface Supplier {
    id: number;
    name: string;
    category: string | null;
    month_spend: number | null;
    delta_pct: number | null;
    month_invoice_count: number | null;
    price_trend?: number[];
  }

  const INLINE_CATEGORY_CHIPS = 4;

  let {
    suppliers,
    categories = [],
    categoryCounts = {},
    totalSpend = 0,
    totalMonthInvoices = 0,
    unassigned = 0,
    firstUnassigned = '',
    search: appliedSearch = '',
    category = '',
    sort = DEFAULT_SUPPLIER_SORT,
    uncategorizedOnly = false,
    onApply,
  }: {
    suppliers: Supplier[];
    categories?: string[];
    categoryCounts?: Record<string, number>;
    totalSpend?: number;
    totalMonthInvoices?: number;
    unassigned?: number;
    firstUnassigned?: string;
    search?: string;
    category?: string;
    sort?: SupplierSortKey;
    uncategorizedOnly?: boolean;
    onApply?: (patch: Record<string, string | null>, replace?: boolean) => void;
  } = $props();

  let search = $state(untrack(() => appliedSearch));
  let sheetOpen = $state(false);
  let sortSheetOpen = $state(false);

  function pickSort(key: SupplierSortKey) {
    sortSheetOpen = false;
    onApply?.({ sort: key });
  }

  const inlineCategories = $derived.by(() => {
    const used = categories.filter(cat => (categoryCounts[cat] ?? 0) > 0);
    const top = (used.length ? used : categories).slice(0, INLINE_CATEGORY_CHIPS);
    if (category && !top.includes(category)) return [category, ...top.slice(0, INLINE_CATEGORY_CHIPS - 1)];
    return top;
  });
  const hiddenCategories = $derived(categories.filter(cat => !inlineCategories.includes(cat)));

  function pickCategory(cat: string | null) {
    sheetOpen = false;
    onApply?.({ category: cat });
  }

  $effect(() => {
    const value = search.trim();
    if (value === appliedSearch) return;
    const timer = setTimeout(() => onApply?.({ q: value || null }, true), SUPPLIER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function deltaColor(v: number) {
    return v > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)';
  }

  function chipClass(active: boolean) {
    return active ? 'chip active' : 'chip';
  }
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden; padding-top: 2px;">

  <div style="padding: 0 18px 10px; position: relative;">
    <span style="position: absolute; left: 30px; top: 50%; transform: translateY(-50%); color: var(--mep-fg-3); pointer-events: none;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    </span>
    <input
      class="input"
      style="width: 100%; height: 40px; padding-left: 36px; box-sizing: border-box;"
      placeholder={$t('sup.searchPlaceholder')}
      bind:value={search}
    />
  </div>

  <ScrollStrip label={$t('sup.categoriesLabel')} extraStyle="flex-shrink:0;">
    <button class={chipClass(!category)} onclick={() => onApply?.({ category: null })}>{$t('sup.allChip')}</button>
    <button
      class={chipClass(uncategorizedOnly)}
      aria-pressed={uncategorizedOnly}
      onclick={() => onApply?.({ uncategorized: uncategorizedOnly ? null : '1' })}
    >{$t('sup.filterUncategorized')}</button>
    {#each inlineCategories as cat}
      <button
        class={chipClass(category === cat)}
        onclick={() => onApply?.({ category: category === cat ? null : cat })}
      >{$tcat(cat)}</button>
    {/each}
    {#if hiddenCategories.length > 0}
      <button
        data-scroll-strip-more
        aria-haspopup="dialog"
        onclick={() => sheetOpen = true}
        class={chipClass(false)}
      >{$ti('sup.categorySheet.open', { n: hiddenCategories.length })}</button>
    {/if}
    <button
      class={chipClass(false)}
      style="gap: 5px;"
      aria-haspopup="dialog"
      onclick={() => sortSheetOpen = true}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
      {$t('sup.sort.label')}
    </button>
  </ScrollStrip>

  {#if sortSheetOpen}
    <button
      type="button"
      class="filter-sheet-backdrop"
      aria-label={$t('sup.categorySheet.close')}
      onclick={() => sortSheetOpen = false}
    ></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('sup.sort.label')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{$t('sup.sort.label')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => sortSheetOpen = false}>{$t('sup.categorySheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        {#each SUPPLIER_SORT_KEYS as key}
          <button type="button" class="filter-sheet-option" aria-pressed={sort === key} onclick={() => pickSort(key)}>
            <span>{$t(SUPPLIER_SORT_LABEL_KEYS[key])}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if sheetOpen}
    <button
      type="button"
      class="filter-sheet-backdrop"
      aria-label={$t('sup.categorySheet.close')}
      onclick={() => sheetOpen = false}
    ></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('sup.categorySheet.title')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{$t('sup.categorySheet.title')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => sheetOpen = false}>{$t('sup.categorySheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        <button type="button" class="filter-sheet-option" aria-pressed={!category} onclick={() => pickCategory(null)}>
          <span>{$t('sup.allChip')}</span>
        </button>
        {#each categories as cat}
          <button type="button" class="filter-sheet-option" aria-pressed={category === cat} onclick={() => pickCategory(category === cat ? null : cat)}>
            <span>{$tcat(cat)}</span>
            <span class="num filter-sheet-count">{categoryCounts[cat] ?? 0}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="card" style="margin: 0 18px 12px; padding: 10px 14px; flex-shrink: 0; display: flex; align-items: center; gap: 0;">
    <div style="flex: 1; text-align: center;">
      <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.3px;">{suppliers.length}</div>
      <div style="font-size: 11px; color: var(--mep-fg-3); margin-top: 1px;">{$t('sup.suppliersChip')}</div>
    </div>
    <div style="width: 1px; height: 28px; background: var(--mep-divider);"></div>
    <div style="flex: 1; text-align: center;">
      <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.3px;">{fmtEur(totalSpend, $locale)}</div>
      <div style="font-size: 11px; color: var(--mep-fg-3); margin-top: 1px;">{$t('sup.monthSpendChip')}</div>
    </div>
    <div style="width: 1px; height: 28px; background: var(--mep-divider);"></div>
    <div style="flex: 1; text-align: center;">
      <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.3px;">{totalMonthInvoices}</div>
      <div style="font-size: 11px; color: var(--mep-fg-3); margin-top: 1px;">{$t('sup.invoicesList')}</div>
    </div>
  </div>

  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 8px;">
    {#if suppliers.length === 0}
      <div style="padding: 40px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        {appliedSearch || category || uncategorizedOnly ? $t('sup.noResults') : $t('sup.noSuppliers')}
      </div>
    {:else}
      {#each suppliers as s}
        <a href="/suppliers/{s.id}" style="
          display: flex; align-items: center; gap: 12px;
          padding: 12px; border-radius: 10px;
          background: var(--mep-surface);
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        ">
          <div style="
            width: 40px; height: 40px; border-radius: 20px; flex-shrink: 0;
            background: {categoryTint(s.category)}; color: {categoryColor(s.category)};
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 600;
          ">
            {initials(s.name)}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              {s.name}
            </div>
            <div style="font-size: 11px; color: var(--mep-fg-3); margin-top: 2px;">
              {$tcat(s.category)}{s.month_invoice_count ? ` · ${s.month_invoice_count} ${$t('sup.invoicesSuffix')}` : ''}
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <div class="num" style="font-size: 13px; font-weight: 500; color: var(--mep-fg);">
              {s.month_spend != null ? fmtEur(s.month_spend, $locale) : '—'}
            </div>
            {#if s.delta_pct != null && Math.abs(s.delta_pct) >= 0.1}
              <div class="num" style="font-size: 11px; color: {deltaColor(s.delta_pct)};">
                {s.delta_pct > 0 ? '↑' : '↓'}{Math.abs(s.delta_pct).toFixed(1).replace('.', ',')}%
              </div>
            {/if}
            {#if s.price_trend && s.price_trend.length >= 3}
              <Sparkline values={s.price_trend} width={64} height={20} />
            {/if}
          </div>
          <ChevronRight size={14} style="color: var(--mep-fg-3); flex-shrink: 0;" />
        </a>
      {/each}
    {/if}
  </div>
</div>
