<script lang="ts">
  import { untrack } from 'svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import { fmtEur } from '$lib/formatters';
  import { locale, t, ti, tcat } from '$lib/i18n';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';
  import { currentMonthRange, type InvoiceFilters } from '$lib/invoice-filters';

  interface Invoice {
    id: number;
    invoice_number: string | null;
    supplier_name: string | null;
    total_amount: number | null;
    display_amount?: number | null;
    status: string | null;
    invoice_date: string | null;
    line_items?: unknown[];
  }

  interface Supplier {
    id: number;
    name: string;
    category?: string | null;
  }

  interface Pagination {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }

  let {
    invoices,
    q,
    onSearch,
    filters,
    suppliers,
    pagination,
    onFilter,
    onLoadMore,
  }: {
    invoices: Invoice[];
    q: string;
    onSearch: (value: string) => void;
    filters: InvoiceFilters;
    suppliers: Supplier[];
    pagination: Pagination;
    onFilter: (patch: Partial<InvoiceFilters>) => void;
    onLoadMore: () => void;
    } = $props();

  const monthRange = currentMonthRange();
  const isThisMonth = $derived(filters.date_from === monthRange.from && filters.date_to === monthRange.to);

  function toggleMonth() {
    onFilter(isThisMonth ? { date_from: '', date_to: '' } : { date_from: monthRange.from, date_to: monthRange.to });
  }
  function toggleStatus(value: string) {
    onFilter({ status: filters.status === value ? '' : value });
  }

  let supplierSheetOpen = $state(false);
  let categorySheetOpen = $state(false);

  const categories = $derived.by(() => {
    const set = new Set<string>();
    for (const s of suppliers) if (s.category) set.add(s.category);
    return [...set].sort();
  });

  function pickSupplier(id: string) {
    supplierSheetOpen = false;
    onFilter({ supplier_id: id });
  }
  function pickCategory(cat: string) {
    categorySheetOpen = false;
    onFilter({ category: cat });
  }

  function filterKey(f: InvoiceFilters, page: number): string {
    return [f.q, f.status, f.supplier_id, f.category, f.date_from, f.date_to, f.uploaded_from, f.uploaded_to, f.sort, page].join('|');
  }

  let accumulated = $state<Invoice[]>(untrack(() => invoices));
  let lastKey = untrack(() => filterKey(filters, pagination.page));

  $effect(() => {
    const key = filterKey(filters, pagination.page);
    if (key === lastKey) return;
    const sameFilters = key.slice(0, key.lastIndexOf('|')) === lastKey.slice(0, lastKey.lastIndexOf('|'));
    const isLoadMore = sameFilters && pagination.page > 1;
    lastKey = key;
    accumulated = isLoadMore ? [...accumulated, ...invoices] : invoices;
  });

  const grouped = $derived.by(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: Map<string, Invoice[]> = new Map();
    for (const inv of accumulated) {
      const d = inv.invoice_date ? new Date(inv.invoice_date) : null;
      let label = $t('misc.noDate');
      if (d) {
        d.setHours(0, 0, 0, 0);
        if (d.getTime() === today.getTime()) {
          label = `${$t('misc.today')} · ${today.toLocaleDateString($locale, { day: 'numeric', month: 'long' })}`;
        } else if (d.getTime() === yesterday.getTime()) {
          label = `${$t('misc.yesterday')} · ${yesterday.toLocaleDateString($locale, { day: 'numeric', month: 'long' })}`;
        } else {
          label = d.toLocaleDateString($locale, { day: 'numeric', month: 'long' });
        }
      }
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(inv);
    }
    return [...groups.entries()];
  });
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
      type="search"
      placeholder={$t('inv.searchPlaceholder')}
      value={q}
      oninput={(e) => onSearch((e.target as HTMLInputElement).value)}
    />
  </div>

  <ScrollStrip label={$t('inv.filterLabel')} extraStyle="flex-shrink:0;">
    <button type="button" class="chip {isThisMonth ? 'active' : ''}" onclick={toggleMonth}>
      {$t('minv.filter.month')}
    </button>
    <button type="button" class="chip {filters.status === 'pending' ? 'active' : ''}" onclick={() => toggleStatus('pending')}>
      {$t('minv.filter.pending')}
    </button>
    <button type="button" class="chip {filters.status === 'overdue' ? 'active' : ''}" onclick={() => toggleStatus('overdue')}>
      {$t('minv.filter.overdue')}
    </button>
    <button type="button" class="chip {filters.supplier_id ? 'active' : ''}" aria-haspopup="dialog" onclick={() => supplierSheetOpen = true}>
      {$t('minv.filter.supplier')}
    </button>
    <button type="button" class="chip {filters.category ? 'active' : ''}" aria-haspopup="dialog" onclick={() => categorySheetOpen = true}>
      {$t('minv.filter.category')}
    </button>
    <a href="/invoices/export" class="chip">{$t('inv.export')}</a>
  </ScrollStrip>

  {#if supplierSheetOpen}
    <button type="button" class="filter-sheet-backdrop" aria-label={$t('minv.sheet.close')} onclick={() => supplierSheetOpen = false}></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('minv.sheet.supplierTitle')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{$t('minv.sheet.supplierTitle')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => supplierSheetOpen = false}>{$t('minv.sheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        <button type="button" class="filter-sheet-option" aria-pressed={!filters.supplier_id} onclick={() => pickSupplier('')}>
          <span>{$t('inv.filter.all')}</span>
        </button>
        {#each suppliers as s}
          <button type="button" class="filter-sheet-option" aria-pressed={filters.supplier_id === String(s.id)}
            onclick={() => pickSupplier(filters.supplier_id === String(s.id) ? '' : String(s.id))}>
            <span>{s.name}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if categorySheetOpen}
    <button type="button" class="filter-sheet-backdrop" aria-label={$t('minv.sheet.close')} onclick={() => categorySheetOpen = false}></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('minv.sheet.categoryTitle')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{$t('minv.sheet.categoryTitle')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => categorySheetOpen = false}>{$t('minv.sheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        <button type="button" class="filter-sheet-option" aria-pressed={!filters.category} onclick={() => pickCategory('')}>
          <span>{$t('minv.sheet.allCategories')}</span>
        </button>
        {#each categories as cat}
          <button type="button" class="filter-sheet-option" aria-pressed={filters.category === cat}
            onclick={() => pickCategory(filters.category === cat ? '' : cat)}>
            <span>{$tcat(cat)}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div style="flex: 1; overflow: auto; padding-bottom: 24px;">
    {#if grouped.length === 0}
      <div style="padding: 40px 18px; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        {$t('misc.invoice.zero')}
      </div>
    {:else}
      {#each grouped as [label, group]}
        <div style="margin-bottom: 16px;">
          <div style="
            padding: 6px 18px;
            font-size: 11.5px; color: var(--mep-fg-3);
            text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500;
          ">{label}</div>
          <div style="padding: 0 18px; display: flex; flex-direction: column; gap: 8px;">
            {#each group as inv}
              <a href="/invoice/{inv.id}" style="
                display: flex; align-items: center; gap: 12px;
                padding: 12px; border-radius: 10px;
                background: var(--mep-surface);
                text-decoration: none;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
              ">
                <div style="
                  width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0;
                  background: var(--mep-surface-2); color: var(--mep-fg-2);
                  display: flex; align-items: center; justify-content: center;
                ">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {inv.supplier_name ?? '—'}
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
                    <StatusBadge status={inv.status ?? 'pending'} style="font-size: 11px; padding: 1px 5px;" />
                    <span class="num" style="font-size: 11px; color: var(--mep-fg-3);">
                      {inv.invoice_number ?? '—'}
                    </span>
                  </div>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                  <div class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">
                    {(inv.display_amount ?? inv.total_amount) != null ? fmtEur((inv.display_amount ?? inv.total_amount)!) : '—'}
                  </div>
                  {#if inv.line_items && inv.line_items.length > 0}
                    <div class="num" style="font-size: 11px; color: var(--mep-fg-3);">
                      {inv.line_items.length} {$t('minv.linesSuffix')}
                    </div>
                  {/if}
                </div>
              </a>
            {/each}
          </div>
        </div>
      {/each}
      {#if pagination.totalPages > 1}
        <div style="padding: 12px 18px 4px; display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <span class="body text-fg-3" style="font-size:11px;">
            {$ti('minv.showing', { shown: accumulated.length, total: pagination.total })}
          </span>
          {#if pagination.page < pagination.totalPages}
            <button type="button" class="btn btn-ghost" style="width:100%;" onclick={onLoadMore}>
              {$t('minv.loadMore')}
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>
