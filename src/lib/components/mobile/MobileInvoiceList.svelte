<script lang="ts">
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import IncidenceKindBadge from '$lib/components/mep/IncidenceKindBadge.svelte';
  import { fmtEur } from '$lib/formatters';
  import { locale, t, tcat, ti } from '$lib/i18n';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';
  import FileDown from '@lucide/svelte/icons/file-down';
  import Check from '@lucide/svelte/icons/check';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import {
    currentMonthRange,
    invoiceFilterParams,
    type InvoiceFilters,
  } from '$lib/invoice-filters';

  interface Invoice {
    id: number;
    invoice_number: string | null;
    supplier_name: string | null;
    total_amount: number | null;
    display_amount?: number | null;
    review_state: string | null;
    incidence_kind: string | null;
    invoice_date: string | null;
    line_items?: unknown[];
  }

  interface SupplierOption {
    id: number;
    name: string;
    category: string | null;
  }

  interface Stats {
    reviewed_count: number;
    to_review_count: number;
    issue_count: number;
    supplier_count: number;
  }

  let {
    invoices,
    q,
    onSearch,
    filters,
    suppliers = [],
    pagination,
    onFilter,
    onLoadMore,
    stats,
  }: {
    invoices: Invoice[];
    q: string;
    onSearch: (value: string) => void;
    filters: InvoiceFilters;
    suppliers?: SupplierOption[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    onFilter: (patch: Partial<InvoiceFilters>) => void;
    onLoadMore: () => void;
    stats: Stats;
    } = $props();

  let supplierSheetOpen = $state(false);
  let categorySheetOpen = $state(false);

  const monthRange = currentMonthRange();
  const monthActive = $derived(filters.date_from === monthRange.from && filters.date_to === monthRange.to);
  const categories = $derived([...new Set(suppliers.map(s => s.category).filter((c): c is string => !!c))]);

  function toggleMonth() {
    onFilter(monthActive
      ? { date_from: '', date_to: '' }
      : { date_from: monthRange.from, date_to: monthRange.to });
  }

  function toggleStatus(status: string) {
    onFilter({ status: filters.status === status ? '' : status });
  }

  function pickSupplier(id: string | null) {
    supplierSheetOpen = false;
    onFilter({ supplier_id: id ?? '' });
  }

  function pickCategory(cat: string | null) {
    categorySheetOpen = false;
    onFilter({ category: cat ?? '' });
  }

  function chipClass(active: boolean) {
    return active ? 'chip active' : 'chip';
  }

  const filterKey = $derived(invoiceFilterParams(filters).toString());

  let acc = $state<{ key: string; page: number; items: Invoice[] }>({ key: '', page: 0, items: [] });

  $effect(() => {
    const key = filterKey;
    const page = pagination.page;
    const items = invoices;
    if (key === acc.key && page === acc.page + 1) {
      acc = { key, page, items: [...acc.items, ...items] };
    } else if (key !== acc.key || page !== acc.page) {
      acc = { key, page, items };
    }
  });

  const shown = $derived(acc.page > 0 && acc.key === filterKey ? acc.items : invoices);
  const hasMore = $derived(pagination.page < pagination.totalPages);

  let selectedIds = $state<Set<number>>(new Set());
  const allSelected  = $derived(shown.length > 0 && selectedIds.size === shown.length);
  const someSelected = $derived(selectedIds.size > 0 && selectedIds.size < shown.length);
  const bulkDownloadHref = $derived(
    `/invoices/export/download?ids=${[...selectedIds].join(',')}&format=zip`
  );

  function toggleSelect(id: number, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    selectedIds = next;
  }
  function toggleSelectAll(checked: boolean) {
    selectedIds = checked ? new Set(shown.map((i) => i.id)) : new Set();
  }
  function submitBulkForm(id: string) {
    (document.getElementById(id) as HTMLFormElement).submit();
  }

  const grouped = $derived.by(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: Map<string, Invoice[]> = new Map();
    for (const inv of shown) {
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
  <div style="padding: 10px 18px 0; flex-shrink: 0;">
    <div class="card" style="display: flex; align-items: center; padding: 0;">
      <div style="flex: 1; text-align: center; padding: 10px 6px;">
        <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-pos); letter-spacing: -0.02em; line-height: 1.1;">{stats.reviewed_count}</div>
        <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mep-fg-3); margin-top: 2px;">{$t('inv.kpi.reviewed')}</div>
      </div>
      <div style="width: 1px; height: 30px; background: var(--mep-border); flex-shrink: 0;"></div>
      <div style="flex: 1; text-align: center; padding: 10px 6px;">
        <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-warn); letter-spacing: -0.02em; line-height: 1.1;">{stats.to_review_count}</div>
        <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mep-fg-3); margin-top: 2px;">{$t('inv.kpi.toReview')}</div>
      </div>
      <div style="width: 1px; height: 30px; background: var(--mep-border); flex-shrink: 0;"></div>
      <div style="flex: 1; text-align: center; padding: 10px 6px;">
        <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-neg); letter-spacing: -0.02em; line-height: 1.1;">{stats.issue_count}</div>
        <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mep-fg-3); margin-top: 2px;">{$t('inv.kpi.issues')}</div>
      </div>
      <div style="width: 1px; height: 30px; background: var(--mep-border); flex-shrink: 0;"></div>
      <div style="flex: 1; text-align: center; padding: 10px 6px;">
        <div class="num" style="font-size: 16px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.02em; line-height: 1.1;">{stats.supplier_count}</div>
        <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mep-fg-3); margin-top: 2px;">{$t('inv.kpi.suppliers')}</div>
      </div>
    </div>
  </div>

  <div style="padding: 10px 18px 10px; position: relative;">
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
    <button
      class={chipClass(monthActive)}
      aria-pressed={monthActive}
      onclick={toggleMonth}
    >{$t('minv.filter.month')}</button>
    <button
      class={chipClass(filters.status === 'por_revisar')}
      aria-pressed={filters.status === 'por_revisar'}
      onclick={() => toggleStatus('por_revisar')}
    >{$t('minv.filter.toReview')}</button>
    <button
      class={chipClass(filters.status === 'incidencia')}
      aria-pressed={filters.status === 'incidencia'}
      onclick={() => toggleStatus('incidencia')}
    >{$t('minv.filter.issues')}</button>
    <button
      class={chipClass(filters.supplier_id !== '')}
      aria-pressed={filters.supplier_id !== ''}
      aria-haspopup="dialog"
      onclick={() => supplierSheetOpen = true}
    >{$t('minv.filter.supplier')}</button>
    <button
      class={chipClass(filters.category !== '')}
      aria-pressed={filters.category !== ''}
      aria-haspopup="dialog"
      onclick={() => categorySheetOpen = true}
    >{$t('minv.filter.category')}</button>
    <a class="chip" href="/invoices/export" style="gap: 6px;">
      <FileDown size={13} />
      {$t('inv.export')}
    </a>
  </ScrollStrip>

  {#if shown.length > 0}
    <form id="mobile-bulk-reviewed-form" method="post" action="?/bulkReviewed" class="hidden">
      {#each [...selectedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
    </form>
    <form id="mobile-bulk-delete-form" method="post" action="?/bulkDelete" class="hidden">
      {#each [...selectedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
    </form>

    <div class="px-[18px] pb-[10px] flex items-center gap-2.5 flex-wrap">
      <label class="flex items-center gap-2 min-h-[44px]">
        <input type="checkbox" class="accent-acc" checked={allSelected} indeterminate={someSelected}
          onchange={(e) => toggleSelectAll((e.target as HTMLInputElement).checked)} />
        <span class="body">{$t('inv.selectAll')}</span>
      </label>
      {#if selectedIds.size > 0}
        <span class="body-strong text-acc">{selectedIds.size} {$t('inv.selected')}</span>
        <button type="button" class="chip gap-1.5" onclick={() => submitBulkForm('mobile-bulk-reviewed-form')}>
          <Check size={13} />
          {$t('inv.markReviewed')}
        </button>
        <button type="button" class="chip gap-1.5" onclick={() => submitBulkForm('mobile-bulk-delete-form')}>
          <Trash2 size={13} />
          {$t('inv.delete')}
        </button>
        <a href={bulkDownloadHref} data-sveltekit-reload class="chip gap-1.5" title={$t('inv.export.selected.tooltip')}>
          <FileDown size={13} />
          {$t('inv.export.selected.button')}
        </a>
      {/if}
    </div>
  {/if}

  {#if supplierSheetOpen}
    <button
      type="button"
      class="filter-sheet-backdrop"
      aria-label={$t('minv.sheet.close')}
      onclick={() => supplierSheetOpen = false}
    ></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('minv.sheet.supplierTitle')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{$t('minv.sheet.supplierTitle')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => supplierSheetOpen = false}>{$t('minv.sheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        <button type="button" class="filter-sheet-option" aria-pressed={!filters.supplier_id} onclick={() => pickSupplier(null)}>
          <span>{$t('inv.filter.all')}</span>
        </button>
        {#each suppliers as s}
          <button
            type="button"
            class="filter-sheet-option"
            aria-pressed={filters.supplier_id === String(s.id)}
            onclick={() => pickSupplier(filters.supplier_id === String(s.id) ? null : String(s.id))}
          >
            <span>{s.name}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if categorySheetOpen}
    <button
      type="button"
      class="filter-sheet-backdrop"
      aria-label={$t('minv.sheet.close')}
      onclick={() => categorySheetOpen = false}
    ></button>
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label={$t('minv.sheet.categoryTitle')}>
      <div class="filter-sheet-head">
        <span class="body-strong">{$t('minv.sheet.categoryTitle')}</span>
        <button type="button" class="btn btn-ghost" onclick={() => categorySheetOpen = false}>{$t('minv.sheet.close')}</button>
      </div>
      <div class="filter-sheet-list">
        <button type="button" class="filter-sheet-option" aria-pressed={!filters.category} onclick={() => pickCategory(null)}>
          <span>{$t('minv.sheet.allCategories')}</span>
        </button>
        {#each categories as cat}
          <button
            type="button"
            class="filter-sheet-option"
            aria-pressed={filters.category === cat}
            onclick={() => pickCategory(filters.category === cat ? null : cat)}
          >
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
            {#each group as inv (inv.id)}
              <div class="flex items-center gap-1">
                <label class="flex items-center justify-center shrink-0 min-h-[44px]">
                  <input type="checkbox" class="accent-acc"
                    checked={selectedIds.has(inv.id)}
                    onclick={(e) => e.stopPropagation()}
                    onchange={(e) => toggleSelect(inv.id, (e.target as HTMLInputElement).checked)} />
                </label>
              <a href="/invoice/{inv.id}" style="
                flex: 1; min-width: 0;
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
                    <StatusBadge status={inv.review_state ?? 'revisado'} style="font-size: 11px; padding: 1px 5px;" />
                    <IncidenceKindBadge kind={inv.incidence_kind} small />
                    <span class="num" style="font-size: 11px; color: var(--mep-fg-3);">
                      {inv.invoice_number ?? '—'}
                    </span>
                  </div>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                  <div class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">
                    {(inv.display_amount ?? inv.total_amount) != null ? fmtEur((inv.display_amount ?? inv.total_amount)!, $locale) : '—'}
                  </div>
                  {#if inv.line_items && inv.line_items.length > 0}
                    <div class="num" style="font-size: 11px; color: var(--mep-fg-3);">
                      {inv.line_items.length} {$t('minv.linesSuffix')}
                    </div>
                  {/if}
                </div>
              </a>
              </div>
            {/each}
          </div>
        </div>
      {/each}

      {#if hasMore}
        <div style="padding: 4px 18px 0;">
          <button
            type="button"
            class="btn btn-secondary"
            style="width: 100%; justify-content: center;"
            onclick={onLoadMore}
          >{$t('minv.loadMore')}</button>
        </div>
      {/if}
      <div style="padding: 10px 18px 0; text-align: center; font-size: 13px; color: var(--mep-fg-3);">
        {$ti('minv.showing', { shown: shown.length, total: pagination.total })}
      </div>
    {/if}
  </div>
</div>
