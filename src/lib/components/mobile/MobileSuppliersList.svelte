<script lang="ts">
  import { fmtEur } from '$lib/formatters';
  import { t } from '$lib/i18n';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Sparkline from '$lib/components/PriceTrendSparkline.svelte';

  interface Supplier {
    id: number;
    name: string;
    color: string | null;
    category: string | null;
    month_spend: number | null;
    delta_pct: number | null;
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

  let search = $state('');
  let catFilter = $state('');

  const filtered = $derived(
    suppliers.filter(s => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q);
      const matchCat = !catFilter || s.category === catFilter;
      return matchSearch && matchCat;
    })
  );

  function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function deltaColor(v: number) {
    return v > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)';
  }
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden; padding-top: 2px;">

  <!-- Search -->
  <div style="padding: 0 18px 10px; position: relative;">
    <span style="position: absolute; left: 30px; top: 50%; transform: translateY(-50%); color: var(--mep-fg-3); pointer-events: none;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    </span>
    <input
      class="input"
      style="width: 100%; height: 40px; padding-left: 36px; font-size: 14px; box-sizing: border-box;"
      placeholder={$t('sup.searchPlaceholder')}
      bind:value={search}
    />
  </div>

  <!-- Category chips -->
  <div style="display: flex; gap: 6px; padding: 0 18px 12px; overflow-x: auto; flex-shrink: 0; scrollbar-width: none;">
    <button
      onclick={() => catFilter = ''}
      style="
        border: 0; height: 30px; padding: 0 12px; border-radius: 15px; white-space: nowrap; cursor: pointer;
        background: {!catFilter ? 'var(--mep-acc)' : 'var(--mep-surface)'};
        color: {!catFilter ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};
        font-size: 12px; font-weight: 500; font-family: inherit;
        box-shadow: {!catFilter ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'};
      "
    >{$t('sup.allChip')}</button>
    {#each categories as cat}
      <button
        onclick={() => catFilter = catFilter === cat ? '' : cat}
        style="
          border: 0; height: 30px; padding: 0 12px; border-radius: 15px; white-space: nowrap; cursor: pointer;
          background: {catFilter === cat ? 'var(--mep-acc)' : 'var(--mep-surface)'};
          color: {catFilter === cat ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};
          font-size: 12px; font-weight: 500; font-family: inherit;
          box-shadow: {catFilter === cat ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'};
        "
      >{cat}</button>
    {/each}
  </div>

  <!-- Summary strip -->
  <div class="card" style="margin: 0 18px 12px; padding: 10px 14px; flex-shrink: 0; display: flex; align-items: center; gap: 0;">
    <div style="flex: 1; text-align: center;">
      <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.3px;">{suppliers.length}</div>
      <div style="font-size: 10px; color: var(--mep-fg-3); margin-top: 1px;">{$t('sup.suppliersChip')}</div>
    </div>
    <div style="width: 1px; height: 28px; background: var(--mep-divider);"></div>
    <div style="flex: 1; text-align: center;">
      <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.3px;">{fmtEur(totalSpend)}</div>
      <div style="font-size: 10px; color: var(--mep-fg-3); margin-top: 1px;">{$t('sup.monthSpendChip')}</div>
    </div>
    <div style="width: 1px; height: 28px; background: var(--mep-divider);"></div>
    <div style="flex: 1; text-align: center;">
      <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.3px;">{totalMonthInvoices}</div>
      <div style="font-size: 10px; color: var(--mep-fg-3); margin-top: 1px;">{$t('sup.invoicesList')}</div>
    </div>
  </div>

  <!-- List -->
  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 8px;">
    {#if filtered.length === 0}
      <div style="padding: 40px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        {$t('sup.noSuppliers')}
      </div>
    {:else}
      {#each filtered as s}
        <a href="/suppliers/{s.id}" style="
          display: flex; align-items: center; gap: 12px;
          padding: 12px; border-radius: 10px;
          background: var(--mep-surface);
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        ">
          <div style="
            width: 40px; height: 40px; border-radius: 20px; flex-shrink: 0;
            background: {s.color ?? 'var(--mep-acc)'}24; color: {s.color ?? 'var(--mep-acc)'};
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
              {s.category && s.category !== 'Other' ? s.category : $t('sup.noCategory')}{s.month_invoice_count ? ` · ${s.month_invoice_count} ${$t('sup.invoicesSuffix')}` : ''}
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <div class="num" style="font-size: 13px; font-weight: 500; color: var(--mep-fg);">
              {s.month_spend != null ? fmtEur(s.month_spend) : '—'}
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
