<script lang="ts">
  import { categoryColor, categoryTint } from '$lib/colors';
  import { t, tcat, ti, locale } from '$lib/i18n';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import Download from '@lucide/svelte/icons/download';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';
  import type { ConversionPrompt } from '$lib/server/products';
  import type { TierConfig } from '$lib/server/billing';
  import { PRODUCT_SORT_KEYS, type ProductSortKey } from '$lib/product-filters';
  import { formatYoyPct } from '$lib/formatters';

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
    features,
    onSortChange,
    onRespondSuggestion,
    onSaveConversion,
  }: {
    products: Product[];
    suggestions: Suggestion[];
    conversionPrompts: ConversionPrompt[];
    categories: string[];
    sort: ProductSortKey;
    features: TierConfig['features'];
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

<div class="h-full flex flex-col overflow-hidden pt-0.5">

  <div class="px-[18px] pb-[10px] flex gap-2 shrink-0">
    <button
      class="btn {tab === 'catalog' ? 'btn-primary' : 'btn-secondary'} flex-1 justify-center text-[13px]"
      onclick={() => tab = 'catalog'}
    >{t('prod.tab.catalog')}</button>
    <button
      class="btn {tab === 'suggestions' ? 'btn-primary' : 'btn-secondary'} flex-1 justify-center text-[13px] gap-1.5"
      onclick={() => tab = 'suggestions'}
    >
      {t('prod.tab.suggestions')}
      {#if pendingCount > 0}
        <span class="badge bg-warn-soft text-warn">{pendingCount}</span>
      {/if}
    </button>
  </div>

  {#if tab === 'catalog'}
    <div class="px-[18px] pb-[10px] relative">
      <span class="absolute left-[30px] top-1/2 -translate-y-1/2 text-fg-3 pointer-events-none">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
      </span>
      <input
        class="input"
        style="width: 100%; height: 40px; padding-left: 36px; box-sizing: border-box;"
        placeholder={t('prod.searchPlaceholder')}
        bind:value={search}
      />
    </div>

    <div class="px-[18px] pb-2.5">
      <select
        class="input w-full h-9"
        aria-label={t('prod.sort.label')}
        value={sort}
        onchange={(e) => onSortChange?.((e.target as HTMLSelectElement).value)}
      >
        {#each PRODUCT_SORT_KEYS as key}
          <option value={key}>{t(`prod.sort.${key}`)}</option>
        {/each}
      </select>
    </div>

    <div class="px-[18px] pb-2.5">
      <a href="/products/inventory-template" data-sveltekit-reload
        class="btn btn-secondary w-full justify-center gap-1.5"
        title={t('prod.inventoryTemplate.tooltip')}>
        <Download size={13} />
        {t('prod.inventoryTemplate.link')}
        {#if !features.inventoryTemplate}
          <span class="badge badge-neutral border border-border">{t('nav.badge.pro')}</span>
        {/if}
      </a>
    </div>

    <ScrollStrip label={t('prod.col.category')} extraStyle="flex-shrink:0;">
      <button class={chipClass(!catFilter)} onclick={() => catFilter = ''}>{t('sup.allChip')}</button>
      <button class={chipClass(catFilter === UNCATEGORIZED_FILTER)} onclick={() => catFilter = catFilter === UNCATEGORIZED_FILTER ? '' : UNCATEGORIZED_FILTER}>
        {t('prod.filter.uncategorized')}
      </button>
      {#each inlineCategories as cat}
        <button class={chipClass(catFilter === cat)} onclick={() => catFilter = catFilter === cat ? '' : cat}>{tcat(cat)}</button>
      {/each}
      {#if hiddenCategories.length > 0}
        <button data-scroll-strip-more class={chipClass(false)} onclick={() => sheetOpen = true}>
          {ti('sup.categorySheet.open', { n: hiddenCategories.length })}
        </button>
      {/if}
    </ScrollStrip>

    {#if sheetOpen}
      <button type="button" class="filter-sheet-backdrop" aria-label={t('sup.categorySheet.close')} onclick={() => sheetOpen = false}></button>
      <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={t('sup.categorySheet.title')}>
        <div class="filter-sheet-head">
          <span class="body-strong">{t('sup.categorySheet.title')}</span>
          <button type="button" class="btn btn-ghost" onclick={() => sheetOpen = false}>{t('sup.categorySheet.close')}</button>
        </div>
        <div class="filter-sheet-list">
          <button type="button" class="filter-sheet-option" aria-pressed={!catFilter} onclick={() => pickCategory(null)}>
            <span>{t('sup.allChip')}</span>
          </button>
          {#each categories as cat}
            <button type="button" class="filter-sheet-option" aria-pressed={catFilter === cat} onclick={() => pickCategory(catFilter === cat ? null : cat)}>
              <span>{tcat(cat)}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="flex-1 overflow-auto px-[18px] pb-4 flex flex-col gap-2">
      {#if filtered.length === 0}
        <div class="py-[40px] text-center text-fg-3 text-[13px]">{t('prod.empty')}</div>
      {:else}
        {#each filtered as p (p.id)}
          <a href="/products/{p.id}" class="flex items-center gap-3 px-[14px] py-3 rounded-[10px] bg-surface no-underline" style="box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div class="w-9 h-9 rounded-card shrink-0 flex items-center justify-center text-[11px] font-semibold"
              style="background:{categoryTint(p.category)};color:{categoryColor(p.category)};">{p.canonicalName.slice(0, 2).toUpperCase()}</div>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium text-fg overflow-hidden text-ellipsis whitespace-nowrap">
                {p.canonicalName}
              </div>
              <div class="text-[11px] text-fg-3 mt-0.5">
                {p.category ? tcat(p.category) : t('prod.uncategorized')} · {p.supplierCount} {t('prod.suppliersSuffix')}
                {#if p.yoyChangePct != null}
                  · <span
                    class:text-neg={p.yoyChangePct > 0}
                    class:text-pos={p.yoyChangePct < 0}
                  >{t('prod.col.yoy')} {formatYoyPct(p.yoyChangePct, locale.current)}</span>
                {/if}
              </div>
            </div>
            {#if p.needsConversion}
              <span title={t('prod.badge.needsConversion')} class="text-warn shrink-0">
                <AlertTriangle size={14} />
              </span>
            {/if}
            <ChevronRight size={14} class="text-fg-3 shrink-0" />
          </a>
        {/each}
        <div class="text-center pt-[10px] pb-1 text-[11px] text-fg-3">
          {ti('prod.totalCount', { n: products.length })}
        </div>
      {/if}
    </div>
  {:else}
    <div class="flex-1 overflow-auto px-[18px] pb-4 flex flex-col gap-[10px]">
      {#if pendingCount === 0}
        <div class="py-[40px] text-center text-fg-3 text-[13px]">{t('prod.suggestions.empty')}</div>
      {:else}
        {#each conversionPrompts as c (c.notificationId)}
          <div class="card p-3 flex flex-col gap-2" style="border-left:3px solid var(--mep-warn);">
            <div class="flex items-center gap-1.5">
              <AlertTriangle size={12} class="text-warn" />
              <span class="badge bg-warn-soft text-warn text-[11px]">{t('prod.conv.badge')}</span>
            </div>
            <p class="text-[13px] text-fg m-0">
              {ti('prod.conv.ask', { unit: c.purchaseUnit, ingredient: c.ingredient, supplier: c.supplierName })}
            </p>
            <form
              class="flex gap-2 flex-wrap"
              onsubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget as HTMLFormElement);
                onSaveConversion?.(c, String(fd.get('canonical_unit') ?? ''), String(fd.get('conversion_factor') ?? ''));
              }}
            >
              <input name="canonical_unit" required class="input" style="flex:1;min-width:100px;height:34px;" placeholder={t('prod.conv.canonicalUnit')} />
              <input name="conversion_factor" type="number" min="0.001" step="any" required class="input" style="flex:1;min-width:100px;height:34px;" placeholder={t('prod.conv.factor')} />
              <button type="submit" class="btn btn-primary" style="height:34px;font-size:13px;">{t('prod.conv.save')}</button>
            </form>
          </div>
        {/each}
        {#each suggestions as s (s.id)}
          <div class="card p-3 flex flex-col gap-2">
            <p class="text-[13px] text-fg m-0">{s.message}</p>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost text-pos flex-1 justify-center" style="height:30px;font-size:13px;"
                onclick={() => onRespondSuggestion?.(s.id, 'confirm', s.description)}>{t('prod.suggestions.confirm')}</button>
              <button type="button" class="btn btn-ghost text-neg flex-1 justify-center" style="height:30px;font-size:13px;"
                onclick={() => onRespondSuggestion?.(s.id, 'reject', s.description)}>{t('prod.suggestions.reject')}</button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
