<script lang="ts">
  import type { PageData } from './$types';
  import { locale, t } from '$lib/i18n';
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
    ['flat', $t('prices.filter.flat')],
  ];
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
      <h2 style="margin:0;font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">{$t('prices.question')}</h2>
    </div>

    <div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <div style="position:relative;flex:1;min-width:180px;">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--mep-fg-3);">
          <Search size={14} />
        </span>
        <input class="input" style="padding-left:32px;width:100%;"
          placeholder={$t('prices.searchPlaceholder')} bind:value={search} />
      </div>
      <form method="get" action="/analytics/prices">
        <select name="supplier_id" class="input" style="padding:0 8px;"
          onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.submit()}>
          <option value="">{$t('prices.allSuppliers')}</option>
          {#each data.suppliers as s}
            <option value={s.id} selected={data.selected_supplier === s.id}>{s.name}</option>
          {/each}
        </select>
      </form>
      <div style="display:flex;gap:0;background:var(--mep-surface-2);border-radius:6px;padding:2px;border:1px solid var(--mep-divider);">
        {#each filterOptions as [val, label]}
          <button onclick={() => filterChange = val} style="
            border:0;background:{filterChange === val ? 'var(--mep-surface)' : 'transparent'};
            color:{filterChange === val ? 'var(--mep-fg)' : 'var(--mep-fg-3)'};
            font-size:12px;padding:5px 10px;border-radius:4px;cursor:pointer;font-family:inherit;
            box-shadow:{filterChange === val ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'};
          ">{label}</button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('prices.tracked')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{data.items.length}</div>
        <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{$t('prices.inTotal')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('prices.up')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:{totalUp > 0 ? 'var(--mep-neg)' : 'var(--mep-fg)'};letter-spacing:-0.4px;line-height:1.1;">{totalUp}</div>
        <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{totalUp > 0 ? $t('prices.upSub') : $t('prices.noUp')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('prices.down')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:{totalDown > 0 ? 'var(--mep-pos)' : 'var(--mep-fg)'};letter-spacing:-0.4px;line-height:1.1;">{totalDown}</div>
        <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{totalDown > 0 ? $t('prices.downSub') : $t('prices.noDown')}</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">{$t('prices.noChange')}</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{totalFlat}</div>
        <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{$t('prices.stablePrices')}</div>
      </div>
    </div>

    {#if !filtered.length}
      <p class="body text-center py-16" style="color:var(--mep-fg-3);">{$t('prices.noDataDesc')}</p>
    {:else}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        {#each filtered as item, i}
          {@const pct = item.change_pct}
          {@const up   = pct !== null && pct > 0.01}
          {@const down = pct !== null && pct < -0.01}
          {@const flat = !up && !down}
          <div class="card" style="
            padding:14px 14px 12px;
            {i === 0 ? 'grid-column:span 2;border-color:var(--mep-acc-ring);box-shadow:0 0 0 3px var(--mep-acc-ring),var(--mep-shadow-card);' : ''}
          ">
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.1px;
                  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title={item.description}>
                  {item.description}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);">{item.supplier_name}</div>
              </div>
              <span class="num" style="
                font-size:11px;font-weight:600;padding:2px 6px;border-radius:4px;flex-shrink:0;
                background:{chipBg(pct)};color:{chipFg(pct)};
                display:inline-flex;align-items:center;gap:3px;
              ">
                {arrow(pct)} {flat ? '0%' : Math.abs(pct ?? 0).toFixed(1).replace('.',',') + '%'}
              </span>
            </div>

            <div style="display:flex;align-items:baseline;gap:8px;margin-top:12px;">
              <span class="num" style="font-size:26px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.5px;line-height:1;">
                {fmtPrice(item.latest_price)}
              </span>
              {#if item.unit}
                <span style="font-size:12px;color:var(--mep-fg-3);">/ {item.unit}</span>
              {/if}
              {#if item.latest_normalized_price !== null && item.base_unit}
                <span class="num" title={$t('prices.perBaseHint')} style="font-size:12px;color:var(--mep-fg-3);border:1px solid var(--mep-divider);border-radius:6px;padding:1px 6px;">
                  {fmtPrice(item.latest_normalized_price)}/{item.base_unit}
                </span>
              {/if}
              {#if item.prev_price !== null && !flat}
                <span class="num" style="margin-left:auto;font-size:12.5px;color:var(--mep-fg-3);text-decoration:line-through;">
                  {fmtPrice(item.prev_price)}
                </span>
              {/if}
            </div>

            <div style="margin-top:6px;font-size:11px;color:var(--mep-fg-3);">
              {$t('prices.latest')}: <span class="num" style="color:var(--mep-fg-2);">{fmtDate(item.latest_date)}</span>
              {#if item.prev_date}
                · {$t('prices.previous')}: <span class="num" style="color:var(--mep-fg-2);">{fmtDate(item.prev_date)}</span>
              {/if}
            </div>

            {#if i === 0 && (item.latest_price || item.prev_price)}
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--mep-divider);display:flex;gap:16px;">
                {#if item.prev_price !== null}
                  <div>
                    <div style="font-size:11px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;">{$t('prices.prevPrice')}</div>
                    <div class="num" style="font-size:13px;font-weight:500;color:var(--mep-fg);margin-top:2px;">{fmtPrice(item.prev_price)}</div>
                  </div>
                {/if}
                <div>
                  <div style="font-size:11px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;">{$t('prices.latestPrice')}</div>
                  <div class="num" style="font-size:13px;font-weight:500;color:var(--mep-fg);margin-top:2px;">{fmtPrice(item.latest_price)}</div>
                </div>
                {#if pct !== null}
                  <div>
                    <div style="font-size:11px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;">{$t('prices.variation')}</div>
                    <div class="num" style="font-size:13px;font-weight:500;color:{chipFg(pct)};margin-top:2px;">
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
