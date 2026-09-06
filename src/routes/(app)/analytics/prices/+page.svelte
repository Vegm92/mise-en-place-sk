<script lang="ts">
  import type { PageData } from './$types';
  import { locale, t } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';
  import Search from '@lucide/svelte/icons/search';
  import MobileAnalyticsPrices from '$lib/components/mobile/MobileAnalyticsPrices.svelte';

  let { data }: { data: PageData } = $props();

  let search        = $state('');
  let filterChange  = $state<'all' | 'up' | 'down' | 'flat'>('all');

  const filtered = $derived(
    data.items.filter(p => {
      if (search && !p.description.toLowerCase().includes(search.toLowerCase()) &&
          !p.supplier_name.toLowerCase().includes(search.toLowerCase())) return false;
      const pct = p.change_pct;
      if (filterChange === 'up'   && !(pct !== null && pct > 0.01))                 return false;
      if (filterChange === 'down' && !(pct !== null && pct < -0.01))                return false;
      if (filterChange === 'flat' && pct !== null && Math.abs(pct) >= 0.01)         return false;
      return true;
    })
  );

  const totalUp   = $derived(data.items.filter(p => p.change_pct !== null && p.change_pct > 0.01).length);
  const totalDown = $derived(data.items.filter(p => p.change_pct !== null && p.change_pct < -0.01).length);
  const totalFlat = $derived(data.items.filter(p => p.change_pct === null || Math.abs(p.change_pct) < 0.01).length);

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

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileAnalyticsPrices
    items={data.items}
    suppliers={data.suppliers}
    selected_supplier={data.selected_supplier}
    totalUp={totalUp}
    totalDown={totalDown}
    totalFlat={totalFlat}
  />
</div>

<div class="hidden md:block" style="height:100%;overflow:auto;">
  <div style="padding:20px 24px 24px;display:flex;flex-direction:column;gap:14px;">

    <div style="display:flex;align-items:center;gap:12px;">
      <h2 class="m-0 text-[20px] font-semibold text-fg tracking-[-0.3px]">{t('prices.question')}</h2>
    </div>

    <div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <div style="position:relative;flex:1;min-width:180px;">
        <span class="absolute left-[10px] top-1/2 -translate-y-1/2 text-fg-3">
          <Search size={14} />
        </span>
        <input class="input" style="padding-left:32px;width:100%;"
          placeholder={t('prices.searchPlaceholder')} bind:value={search} />
      </div>
      <form method="get" action="/analytics/prices">
        <select name="supplier_id" class="input" style="padding:0 8px;"
          onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.submit()}>
          <option value="">{t('prices.allSuppliers')}</option>
          {#each data.suppliers as s}
            <option value={s.id} selected={data.selected_supplier === s.id}>{s.name}</option>
          {/each}
        </select>
      </form>
      <div class="flex bg-surface-2 rounded-md p-0.5 border border-divider">
        {#each filterOptions as [val, label]}
          <button onclick={() => filterChange = val}
            class="border-0 text-[12px] px-2.5 py-[5px] rounded cursor-pointer font-[inherit]"
            class:bg-surface={filterChange === val}
            class:bg-transparent={filterChange !== val}
            class:text-fg={filterChange === val}
            class:text-fg-3={filterChange !== val}
            style="{filterChange === val ? 'box-shadow:0 1px 2px rgba(0,0,0,0.05);' : ''}"
          >{label}</button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{t('prices.tracked')}</div>
        <div class="num text-[22px] font-semibold text-fg tracking-[-0.4px] leading-[1.1]">{data.items.length}</div>
        <div class="text-[11.5px] text-fg-3 mt-1.5">{t('prices.inTotal')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{t('prices.up')}</div>
        <div class="num text-[22px] font-semibold tracking-[-0.4px] leading-[1.1]"
          class:text-neg={totalUp > 0} class:text-fg={totalUp <= 0}>{totalUp}</div>
        <div class="text-[11.5px] text-fg-3 mt-1.5">{totalUp > 0 ? t('prices.upSub') : t('prices.noUp')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{t('prices.down')}</div>
        <div class="num text-[22px] font-semibold tracking-[-0.4px] leading-[1.1]"
          class:text-pos={totalDown > 0} class:text-fg={totalDown <= 0}>{totalDown}</div>
        <div class="text-[11.5px] text-fg-3 mt-1.5">{totalDown > 0 ? t('prices.downSub') : t('prices.noDown')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{t('prices.noChange')}</div>
        <div class="num text-[22px] font-semibold text-fg tracking-[-0.4px] leading-[1.1]">{totalFlat}</div>
        <div class="text-[11.5px] text-fg-3 mt-1.5">{t('prices.stablePrices')}</div>
      </div>
    </div>

    {#if !filtered.length}
      <p class="body text-center py-16 text-fg-3">{t('prices.noDataDesc')}</p>
    {:else}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        {#each filtered as item, i}
          {@const pct = item.change_pct}
          {@const up   = pct !== null && pct > 0.01}
          {@const down = pct !== null && pct < -0.01}
          {@const flat = !up && !down}
          <div class="card px-3.5 pt-3.5 pb-3"
            style="{i === 0 ? 'grid-column:span 2;border-color:var(--mep-acc-ring);box-shadow:0 0 0 3px var(--mep-acc-ring),var(--mep-shadow-card);' : ''}"
          >
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div style="flex:1;min-width:0;">
                <div class="text-[14px] font-semibold text-fg tracking-[-0.1px] overflow-hidden text-ellipsis whitespace-nowrap" title={item.description}>
                  {item.description}
                </div>
                <div class="text-[11.5px] text-fg-3">{item.supplier_name}</div>
              </div>
              <span class="num text-[11px] font-semibold py-px px-1.5 rounded shrink-0 inline-flex items-center gap-[3px]"
                class:bg-hover={flat} class:text-fg-3={flat}
                class:bg-neg-soft={up} class:text-neg={up}
                class:bg-pos-soft={down} class:text-pos={down}
              >
                {arrow(pct)} {flat ? '0%' : Math.abs(pct ?? 0).toFixed(1).replace('.',',') + '%'}
              </span>
            </div>

            <div style="display:flex;align-items:baseline;gap:8px;margin-top:12px;">
              <span class="num text-[26px] font-semibold text-fg tracking-[-0.5px] leading-none">
                {fmtPrice(item.latest_price)}
              </span>
              {#if item.unit}
                <span class="text-[12px] text-fg-3">/ {item.unit}</span>
              {/if}
              {#if item.latest_normalized_price !== null && item.base_unit}
                <span class="num text-[12px] text-fg-3 border border-divider rounded-md px-1.5 py-px" title={t('prices.perBaseHint')}>
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

            {#if i === 0 && (item.latest_price || item.prev_price)}
              <div class="mt-2.5 pt-2.5 border-t border-divider flex gap-4">
                {#if item.prev_price !== null}
                  <div>
                    <div class="text-[11px] text-fg-3 uppercase tracking-[0.04em] font-medium">{t('prices.prevPrice')}</div>
                    <div class="num text-[13px] font-medium text-fg mt-0.5">{fmtPrice(item.prev_price)}</div>
                  </div>
                {/if}
                <div>
                  <div class="text-[11px] text-fg-3 uppercase tracking-[0.04em] font-medium">{t('prices.latestPrice')}</div>
                  <div class="num text-[13px] font-medium text-fg mt-0.5">{fmtPrice(item.latest_price)}</div>
                </div>
                {#if pct !== null}
                  <div>
                    <div class="text-[11px] text-fg-3 uppercase tracking-[0.04em] font-medium">{t('prices.variation')}</div>
                    <div class="num text-[13px] font-medium mt-0.5"
                      class:text-fg-3={flat} class:text-neg={up} class:text-pos={down}
                    >
                      {arrow(pct)} {flat ? '0%' : Math.abs(pct).toFixed(1).replace('.',',') + '%'}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  </div>
</div>
