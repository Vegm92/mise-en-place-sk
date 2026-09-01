<script lang="ts">
  import { categoryColor, categoryTint } from '$lib/colors';
  import { t, tcat, ti } from '$lib/i18n';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';
  import type { ConversionPrompt } from '$lib/server/products';
  import { PRODUCT_SORT_KEYS, type ProductSortKey } from '$lib/product-filters';
  import { formatYoyPct } from '$lib/price-yoy';

  interface Product {
    id: number;
    canonicalName: string;
    category: string | null;
    supplierCount: number;
    needsConversion: boolean;
    yoyChangePct: number | null;
  }
  interface Suggestion { id: number; message: string; description: string }

  const INLINE_CATEGORY_CHIPS = 4;
  const UNCATEGORIZED_FILTER = '__uncategorized__';

  let {
    products,
    suggestions,
    conversionPrompts,
    categories,
    sort,
    onSortChange,
    onRespondSuggestion,
    onSaveConversion,
  }: {
    products: Product[];
    suggestions: Suggestion[];
    conversionPrompts: ConversionPrompt[];
    categories: string[];
    sort: ProductSortKey;
    onSortChange?: (next: string) => void;
    onRespondSuggestion?: (id: number, action: 'confirm' | 'reject', description: string) => void;
    onSaveConversion?: (prompt: ConversionPrompt, canonicalUnit: string, factor: string) => void;
  } = $props();

  let tab = $state<'catalog' | 'suggestions'>('catalog');
  let search = $state('');
  let catFilter = $state('');
  let sheetOpen = $state(false);

  const pendingCount = $derived(suggestions.length + conversionPrompts.length);

  const usedCategories = $derived([...new Set(products.map(p => p.category).filter((c): c is string => !!c))]);
  const inlineCategories = $derived.by(() => {
    const used = categories.filter(c => usedCategories.includes(c));
    const top = (used.length ? used : categories).slice(0, INLINE_CATEGORY_CHIPS);
    if (catFilter && catFilter !== UNCATEGORIZED_FILTER && !top.includes(catFilter)) {
      return [catFilter, ...top.slice(0, INLINE_CATEGORY_CHIPS - 1)];
    }
    return top;
  });
  const hiddenCategories = $derived(categories.filter(c => !inlineCategories.includes(c)));

  function pickCategory(cat: string | null) {
    sheetOpen = false;
    catFilter = cat ?? '';
  }

  function chipClass(active: boolean) {
    return active ? 'chip active' : 'chip';
  }

  const filtered = $derived(products.filter(p => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || p.canonicalName.toLowerCase().includes(q);
    const matchCat = !catFilter
      || (catFilter === UNCATEGORIZED_FILTER ? p.category == null : p.category === catFilter);
    return matchSearch && matchCat;
  }));
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden; padding-top: 2px;">

  <div style="padding: 0 18px 10px; display: flex; gap: 8px; flex-shrink: 0;">
    <button
      class="btn {tab === 'catalog' ? 'btn-primary' : 'btn-secondary'}"
      style="flex: 1; justify-content: center; font-size: 13px;"
      onclick={() => tab = 'catalog'}
    >{$t('prod.tab.catalog')}</button>
    <button
      class="btn {tab === 'suggestions' ? 'btn-primary' : 'btn-secondary'}"
      style="flex: 1; justify-content: center; font-size: 13px; gap: 6px;"
      onclick={() => tab = 'suggestions'}
    >
      {$t('prod.tab.suggestions')}
      {#if pendingCount > 0}
        <span class="badge" style="background:var(--mep-warn-soft);color:var(--mep-warn);">{pendingCount}</span>
      {/if}
    </button>
  </div>

  {#if tab === 'catalog'}
    <div style="padding: 0 18px 10px; position: relative;">
      <span style="position: absolute; left: 30px; top: 50%; transform: translateY(-50%); color: var(--mep-fg-3); pointer-events: none;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
      </span>
      <input
        class="input"
        style="width: 100%; height: 40px; padding-left: 36px; box-sizing: border-box;"
        placeholder={$t('prod.searchPlaceholder')}
        bind:value={search}
      />
    </div>

    <div style="padding: 0 18px 10px;">
      <select
        class="input"
        style="width: 100%; height: 36px;"
        aria-label={$t('prod.sort.label')}
        value={sort}
        onchange={(e) => onSortChange?.((e.target as HTMLSelectElement).value)}
      >
        {#each PRODUCT_SORT_KEYS as key}
          <option value={key}>{$t(`prod.sort.${key}`)}</option>
        {/each}
      </select>
    </div>

    <ScrollStrip label={$t('prod.col.category')} extraStyle="flex-shrink:0;">
      <button class={chipClass(!catFilter)} onclick={() => catFilter = ''}>{$t('sup.allChip')}</button>
      <button class={chipClass(catFilter === UNCATEGORIZED_FILTER)} onclick={() => catFilter = catFilter === UNCATEGORIZED_FILTER ? '' : UNCATEGORIZED_FILTER}>
        {$t('prod.filter.uncategorized')}
      </button>
      {#each inlineCategories as cat}
        <button class={chipClass(catFilter === cat)} onclick={() => catFilter = catFilter === cat ? '' : cat}>{$tcat(cat)}</button>
      {/each}
      {#if hiddenCategories.length > 0}
        <button data-scroll-strip-more class={chipClass(false)} onclick={() => sheetOpen = true}>
          {$ti('sup.categorySheet.open', { n: hiddenCategories.length })}
        </button>
      {/if}
    </ScrollStrip>

    {#if sheetOpen}
      <button type="button" class="filter-sheet-backdrop" aria-label={$t('sup.categorySheet.close')} onclick={() => sheetOpen = false}></button>
      <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('sup.categorySheet.title')}>
        <div class="filter-sheet-head">
          <span class="body-strong">{$t('sup.categorySheet.title')}</span>
          <button type="button" class="btn btn-ghost" onclick={() => sheetOpen = false}>{$t('sup.categorySheet.close')}</button>
        </div>
        <div class="filter-sheet-list">
          <button type="button" class="filter-sheet-option" aria-pressed={!catFilter} onclick={() => pickCategory(null)}>
            <span>{$t('sup.allChip')}</span>
          </button>
          {#each categories as cat}
            <button type="button" class="filter-sheet-option" aria-pressed={catFilter === cat} onclick={() => pickCategory(catFilter === cat ? null : cat)}>
              <span>{$tcat(cat)}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div style="flex: 1; overflow: auto; padding: 0 18px 16px; display: flex; flex-direction: column; gap: 8px;">
      {#if filtered.length === 0}
        <div style="padding: 40px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">{$t('prod.empty')}</div>
      {:else}
        {#each filtered as p (p.id)}
          <a href="/products/{p.id}" style="
            display: flex; align-items: center; gap: 12px;
            padding: 12px 14px; border-radius: 10px;
            background: var(--mep-surface);
            text-decoration: none;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          ">
            <div style="
              width: 36px; height: 36px; border-radius: var(--mep-r-card); flex-shrink: 0;
              background: {categoryTint(p.category)}; color: {categoryColor(p.category)};
              display: flex; align-items: center; justify-content: center;
              font-size: 11px; font-weight: 600;
            ">{p.canonicalName.slice(0, 2).toUpperCase()}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {p.canonicalName}
              </div>
              <div style="font-size: 11px; color: var(--mep-fg-3); margin-top: 2px;">
                {p.category ? $tcat(p.category) : $t('prod.uncategorized')} · {p.supplierCount} {$t('prod.suppliersSuffix')}
                {#if p.yoyChangePct != null}
                  · <span
                    class:text-neg={p.yoyChangePct > 0}
                    class:text-pos={p.yoyChangePct < 0}
                  >{$t('prod.col.yoy')} {formatYoyPct(p.yoyChangePct)}</span>
                {/if}
              </div>
            </div>
            {#if p.needsConversion}
              <span title={$t('prod.badge.needsConversion')} style="color: var(--mep-warn); flex-shrink: 0;">
                <AlertTriangle size={14} />
              </span>
            {/if}
            <ChevronRight size={14} style="color: var(--mep-fg-3); flex-shrink: 0;" />
          </a>
        {/each}
        <div style="text-align: center; padding: 10px 0 4px; font-size: 11px; color: var(--mep-fg-3);">
          {$ti('prod.totalCount', { n: products.length })}
        </div>
      {/if}
    </div>
  {:else}
    <div style="flex: 1; overflow: auto; padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px;">
      {#if pendingCount === 0}
        <div style="padding: 40px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">{$t('prod.suggestions.empty')}</div>
      {:else}
        {#each conversionPrompts as c (c.notificationId)}
          <div class="card" style="padding: 12px; border-left: 3px solid var(--mep-warn); display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <AlertTriangle size={12} style="color: var(--mep-warn);" />
              <span class="badge" style="background:var(--mep-warn-soft);color:var(--mep-warn);font-size:11px;">{$t('prod.conv.badge')}</span>
            </div>
            <p style="font-size: 13px; color: var(--mep-fg); margin: 0;">
              {$ti('prod.conv.ask', { unit: c.purchaseUnit, ingredient: c.ingredient, supplier: c.supplierName })}
            </p>
            <form
              style="display: flex; gap: 8px; flex-wrap: wrap;"
              onsubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget as HTMLFormElement);
                onSaveConversion?.(c, String(fd.get('canonical_unit') ?? ''), String(fd.get('conversion_factor') ?? ''));
              }}
            >
              <input name="canonical_unit" required class="input" style="flex:1;min-width:100px;height:34px;" placeholder={$t('prod.conv.canonicalUnit')} />
              <input name="conversion_factor" type="number" min="0.001" step="any" required class="input" style="flex:1;min-width:100px;height:34px;" placeholder={$t('prod.conv.factor')} />
              <button type="submit" class="btn btn-primary" style="height:34px;font-size:13px;">{$t('prod.conv.save')}</button>
            </form>
          </div>
        {/each}
        {#each suggestions as s (s.id)}
          <div class="card" style="padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <p style="font-size: 13px; color: var(--mep-fg); margin: 0;">{s.message}</p>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-ghost text-pos" style="height:30px;font-size:13px;flex:1;justify-content:center;"
                onclick={() => onRespondSuggestion?.(s.id, 'confirm', s.description)}>{$t('prod.suggestions.confirm')}</button>
              <button type="button" class="btn btn-ghost text-neg" style="height:30px;font-size:13px;flex:1;justify-content:center;"
                onclick={() => onRespondSuggestion?.(s.id, 'reject', s.description)}>{$t('prod.suggestions.reject')}</button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
