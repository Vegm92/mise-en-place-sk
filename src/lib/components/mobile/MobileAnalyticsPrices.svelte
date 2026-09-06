<script lang="ts">
  import { goto } from '$app/navigation';
  import { locale, t } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';

  interface PriceItem {
    description: string;
    supplier_name: string;
    change_pct: number | null;
    latest_price: number;
    latest_normalized_price: number | null;
    base_unit: string | null;
    prev_price: number | null;
    unit: string | null;
    latest_date: string | null;
    prev_date: string | null;
  }
  interface SupplierOption {
    id: number;
    name: string;
  }

  let {
    items,
    suppliers,
    selected_supplier,
    totalUp,
    totalDown,
    totalFlat,
  }: {
    items: PriceItem[];
    suppliers: SupplierOption[];
    selected_supplier: number | null;
    totalUp: number;
    totalDown: number;
    totalFlat: number;
  } = $props();

  let search = $state('');
  let filterChange = $state<'all' | 'up' | 'down' | 'flat'>('all');
  let supplierSheetOpen = $state(false);

  function pickSupplier(id: number | null) {
    supplierSheetOpen = false;
    const url = new URL('/analytics/prices', window.location.origin);
    if (id !== null) url.searchParams.set('supplier_id', String(id));
    goto(url.pathname + url.search);
  }

  const filtered = $derived(
    items.filter(p => {
      if (search && !p.description.toLowerCase().includes(search.toLowerCase()) &&
          !p.supplier_name.toLowerCase().includes(search.toLowerCase())) return false;
      const pct = p.change_pct;
      if (filterChange === 'up'   && !(pct !== null && pct > 0.01))  return false;
      if (filterChange === 'down' && !(pct !== null && pct < -0.01)) return false;
      if (filterChange === 'flat' && pct !== null && Math.abs(pct) >= 0.01) return false;
      return true;
    })
  );

  function fmtPrice(n: number) {
    return fmtEur(n, locale.current);
  }
  function fmtDate(d: string | null) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString(locale.current, { day: '2-digit', month: 'short' }); }
    catch { return d; }
  }
  function arrow(pct: number | null) {
    if (pct === null || Math.abs(pct) < 0.01) return '—';
    return pct > 0 ? '↑' : '↓';
  }

  const filterOptions = $derived<Array<[typeof filterChange, string]>>([
    ['all',  t('prices.filter.all')],
    ['up',   t('prices.filter.up')],
    ['down', t('prices.filter.down')],
    ['flat', t('prices.filter.flat')],
  ]);
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden; padding-top: 2px;">
  <div style="padding: 0 18px 10px; position: relative;">
    <span class="absolute left-[30px] top-1/2 -translate-y-1/2 text-fg-3 pointer-events-none">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    </span>
    <input
      class="input"
      style="width: 100%; height: 40px; padding-left: 36px; box-sizing: border-box;"
      placeholder={t('prices.searchPlaceholder')}
      bind:value={search}
    />
  </div>

  <ScrollStrip label={t('anp.filterLabel')} extraStyle="flex-shrink:0;">
    {#each filterOptions as [val, label]}
      <button
        class="chip {filterChange === val ? 'active' : ''}"
        onclick={() => filterChange = val}
      >{label}</button>
    {/each}
    <button
      class="chip {selected_supplier !== null ? 'active' : ''}"
      style="gap: 5px;"
      aria-haspopup="dialog"
      onclick={() => supplierSheetOpen = true}
    >{t('prices.filter.supplier')}</button>
  </ScrollStrip>

  {#if supplierSheetOpen}
    <button
      type="button"
      class="filter-sheet-backdrop"
      aria-label={t('minv.sheet.close')}
      onclick={() => supplierSheetOpen = false}
    ></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={t('prices.filter.supplier')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{t('prices.filter.supplier')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => supplierSheetOpen = false}>{t('minv.sheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        <button type="button" class="filter-sheet-option" aria-pressed={selected_supplier === null} onclick={() => pickSupplier(null)}>
          <span>{t('prices.allSuppliers')}</span>
        </button>
        {#each suppliers as s}
          <button type="button" class="filter-sheet-option" aria-pressed={selected_supplier === s.id} onclick={() => pickSupplier(s.id)}>
            <span>{s.name}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 14px;">

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{t('prices.tracked')}</div>
        <div class="num text-[20px] font-semibold tracking-[-0.4px] leading-[1.1] text-fg">{items.length}</div>
        <div class="text-[11px] text-fg-3 mt-1">{t('prices.inTotal')}</div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{t('prices.up')}</div>
        <div class="num text-[20px] font-semibold tracking-[-0.4px] leading-[1.1]"
          class:text-neg={totalUp > 0} class:text-fg={totalUp <= 0}>{totalUp}</div>
        <div class="text-[11px] text-fg-3 mt-1">{totalUp > 0 ? t('prices.upSub') : t('prices.noUp')}</div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{t('prices.down')}</div>
        <div class="num text-[20px] font-semibold tracking-[-0.4px] leading-[1.1]"
          class:text-pos={totalDown > 0} class:text-fg={totalDown <= 0}>{totalDown}</div>
        <div class="text-[11px] text-fg-3 mt-1">{totalDown > 0 ? t('prices.downSub') : t('prices.noDown')}</div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style=" margin-bottom: 5px;">{t('prices.noChange')}</div>
        <div class="num text-[20px] font-semibold tracking-[-0.4px] leading-[1.1] text-fg">{totalFlat}</div>
        <div class="text-[11px] text-fg-3 mt-1">{t('prices.stablePrices')}</div>
      </div>
    </div>

    {#if items.length === 0}
      <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px 0; text-align: center;">
        <p class="body text-fg-3 text-[13px] max-w-[260px] m-0">{t('prices.noDataDesc')}</p>
        <a href="/" class="text-[13px] text-acc no-underline inline-flex items-center min-h-[44px]">{t('spend.uploadFirst')}</a>
      </div>
    {:else if filtered.length === 0}
      <div class="py-8 text-center text-fg-3 text-[13px]">{t('prices.noResults')}</div>
    {:else}
      <div style="display: flex; flex-direction: column; gap: 8px;">
        {#each filtered as item}
          {@const pct = item.change_pct}
          {@const up   = pct !== null && pct > 0.01}
          {@const down = pct !== null && pct < -0.01}
          {@const flat = !up && !down}
          <div class="card" style="padding: 14px;">
            <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
              <div style="flex: 1; min-width: 0;">
                <div class="text-[13.5px] font-semibold text-fg overflow-hidden text-ellipsis whitespace-nowrap">
                  {item.description}
                </div>
                <div class="text-[11.5px] text-fg-3 mt-0.5">{item.supplier_name}</div>
              </div>
              <span class="num text-[11px] font-semibold py-px px-1.5 rounded shrink-0 inline-flex items-center gap-[3px]"
                class:bg-hover={flat} class:text-fg-3={flat}
                class:bg-neg-soft={up} class:text-neg={up}
                class:bg-pos-soft={down} class:text-pos={down}
              >
                {arrow(pct)} {flat ? '0%' : Math.abs(pct ?? 0).toFixed(1).replace('.', ',') + '%'}
              </span>
            </div>
            <div style="display: flex; align-items: baseline; gap: 8px;">
              <span class="num text-[24px] font-semibold text-fg tracking-[-0.5px] leading-none">
                {fmtPrice(item.latest_price)}
              </span>
              {#if item.unit}
                <span class="text-[12px] text-fg-3">/ {item.unit}</span>
              {/if}
              {#if item.latest_normalized_price !== null && item.base_unit}
                <span class="num text-[11px] text-fg-3 border border-divider rounded-md px-1.5 py-px" title={t('prices.perBaseHint')}>
                  {fmtPrice(item.latest_normalized_price)}/{item.base_unit}
                </span>
              {/if}
              {#if item.prev_price !== null && !flat}
                <span class="num ml-auto text-[12.5px] text-fg-3 line-through">
                  {fmtPrice(item.prev_price)}
                </span>
              {/if}
            </div>
            <div class="mt-1.5 text-[11px] text-fg-3">
              {t('prices.latest')}: <span class="num text-fg-2">{fmtDate(item.latest_date)}</span>
              {#if item.prev_date}
                · {t('prices.previous')}: <span class="num text-fg-2">{fmtDate(item.prev_date)}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

  </div>
</div>
