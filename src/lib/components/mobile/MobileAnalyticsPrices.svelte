<script lang="ts">
  import { locale, t } from '$lib/i18n';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';

  interface PriceItem {
    description: string;
    supplier_name: string;
    change_pct: number | null;
    latest_price: number;
    prev_price: number | null;
    unit: string | null;
    latest_date: string | null;
    prev_date: string | null;
  }

  let {
    items,
    totalUp,
    totalDown,
    totalFlat,
  }: {
    items: PriceItem[];
    totalUp: number;
    totalDown: number;
    totalFlat: number;
  } = $props();

  let search = $state('');
  let filterChange = $state<'all' | 'up' | 'down' | 'flat'>('all');

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
    return n.toFixed(2).replace('.', ',') + ' €';
  }
  function fmtDate(d: string | null) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString($locale, { day: '2-digit', month: 'short' }); }
    catch { return d; }
  }
  function chipBg(pct: number | null) {
    if (pct === null || Math.abs(pct) < 0.01) return 'var(--mep-hover)';
    return pct > 0 ? 'var(--mep-neg-soft)' : 'var(--mep-pos-soft)';
  }
  function chipFg(pct: number | null) {
    if (pct === null || Math.abs(pct) < 0.01) return 'var(--mep-fg-3)';
    return pct > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)';
  }
  function arrow(pct: number | null) {
    if (pct === null || Math.abs(pct) < 0.01) return '—';
    return pct > 0 ? '↑' : '↓';
  }

  const filterOptions: Array<[typeof filterChange, string]> = [
    ['all',  $t('prices.filter.all')],
    ['up',   $t('prices.filter.up')],
    ['down', $t('prices.filter.down')],
    ['flat', $t('prices.filter.stable')],
  ];
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
      style="width: 100%; height: 40px; padding-left: 36px; font-size: 14px; box-sizing: border-box;"
      placeholder={$t('prices.searchPlaceholder')}
      bind:value={search}
    />
  </div>

  <ScrollStrip label={$t('anp.filterLabel')} extraStyle="flex-shrink:0;">
    {#each filterOptions as [val, label]}
      <button
        style="
          border: 0; height: 30px; padding: 0 12px; border-radius: 15px; white-space: nowrap;
          background: {filterChange === val ? 'var(--mep-acc)' : 'var(--mep-surface)'};
          color: {filterChange === val ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};
          font-size: 12px; font-weight: 500; cursor: pointer;
          box-shadow: {filterChange === val ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'};
          font-family: inherit;
        "
        onclick={() => filterChange = val}
      >{label}</button>
    {/each}
  </ScrollStrip>

  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 14px;">

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">{$t('prices.up')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; letter-spacing: -0.4px; line-height: 1.1; color: {totalUp > 0 ? 'var(--mep-neg)' : 'var(--mep-fg)'};">
          {totalUp}
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">{$t('prices.down')}</div>
        <div class="num" style="font-size: 20px; font-weight: 600; letter-spacing: -0.4px; line-height: 1.1; color: {totalDown > 0 ? 'var(--mep-pos)' : 'var(--mep-fg)'};">
          {totalDown}
        </div>
      </div>
    </div>

    {#if filtered.length === 0}
      <div style="padding: 32px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">{$t('prices.noResults')}</div>
    {:else}
      <div style="display: flex; flex-direction: column; gap: 8px;">
        {#each filtered as item}
          {@const pct = item.change_pct}
          {@const flat = pct === null || Math.abs(pct) < 0.01}
          <div class="card" style="padding: 14px;">
            <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 13.5px; font-weight: 600; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  {item.description}
                </div>
                <div style="font-size: 11.5px; color: var(--mep-fg-3); margin-top: 2px;">{item.supplier_name}</div>
              </div>
              <span class="num" style="
                font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
                background: {chipBg(pct)}; color: {chipFg(pct)};
                display: inline-flex; align-items: center; gap: 3px;
              ">
                {arrow(pct)} {flat ? '0%' : Math.abs(pct ?? 0).toFixed(1).replace('.', ',') + '%'}
              </span>
            </div>
            <div style="display: flex; align-items: baseline; gap: 8px;">
              <span class="num" style="font-size: 24px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.5px; line-height: 1;">
                {fmtPrice(item.latest_price)}
              </span>
              {#if item.unit}
                <span style="font-size: 12px; color: var(--mep-fg-3);">/ {item.unit}</span>
              {/if}
              {#if item.prev_price !== null && !flat}
                <span class="num" style="margin-left: auto; font-size: 12.5px; color: var(--mep-fg-3); text-decoration: line-through;">
                  {fmtPrice(item.prev_price)}
                </span>
              {/if}
            </div>
            <div style="margin-top: 6px; font-size: 11px; color: var(--mep-fg-3);">
              {$t('prices.latest')}: <span class="num" style="color: var(--mep-fg-2);">{fmtDate(item.latest_date)}</span>
              {#if item.prev_date}
                · {$t('prices.previous')}: <span class="num" style="color: var(--mep-fg-2);">{fmtDate(item.prev_date)}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

  </div>
</div>
