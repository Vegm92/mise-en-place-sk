<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { fmt, fmtDateShort, fmtEur } from '$lib/formatters';
  import { t, ti, tp, locale } from '$lib/i18n';
  import { debounce } from '$lib/debounce';
  import {
    EMPTY_INVOICE_FILTERS,
    countActiveInvoiceFilters,
    defaultFiltersOpen,
    invoiceFilterParams,
    invoiceFiltersHref,
    type InvoiceFilters,
    type InvoiceSortKey,
  } from '$lib/invoice-filters';
  import ListPageTemplate from '$lib/components/mep/ListPageTemplate.svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import MobileInvoiceList from '$lib/components/mobile/MobileInvoiceList.svelte';
  import ConfirmDialog from '$lib/components/mep/ConfirmDialog.svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FileDown from '@lucide/svelte/icons/file-down';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Check from '@lucide/svelte/icons/check';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Eye from '@lucide/svelte/icons/eye';
  import Search from '@lucide/svelte/icons/search';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';

  const { data }: { data: PageData } = $props();
  const { invoices, stats, suppliers, filters: serverFilters, pagination } = $derived(data);

  let toastDismissed = $state(false);
  const showSavedToast = $derived(data.savedInvoiceId !== null && !toastDismissed);

  $effect(() => {
    if (!showSavedToast || data.savedAlerts.length > 0) return;
    const timer = setTimeout(() => { toastDismissed = true; }, 6000);
    return () => clearTimeout(timer);
  });

  function pageUrl(p: number): string {
    return invoiceFiltersHref(serverFilters, { period: data.period, page: p });
  }

  const SEARCH_DEBOUNCE_MS = 300;

  let filterDraft = $state<InvoiceFilters>(untrack(() => ({ ...data.filters })));
  let filtersOpen = $state(untrack(() => defaultFiltersOpen(countActiveInvoiceFilters(data.filters))));
  let lastRequested = untrack(() => invoiceFilterParams(data.filters).toString());
  const activeCount = $derived(countActiveInvoiceFilters(filterDraft));

  $effect(() => {
    const incoming = invoiceFilterParams(data.filters).toString();
    if (incoming === lastRequested) return;
    lastRequested = incoming;
    filterDraft = { ...data.filters };
  });

  function applyFilters(replace = false) {
    lastRequested = invoiceFilterParams(filterDraft, { period: data.period }).toString();
    goto(invoiceFiltersHref(filterDraft, { period: data.period }), {
      keepFocus: true,
      noScroll: true,
      replaceState: replace,
    });
  }

  const applySearch = debounce(() => applyFilters(true), SEARCH_DEBOUNCE_MS);

  function setFilter<K extends keyof InvoiceFilters>(key: K, value: InvoiceFilters[K]) {
    applySearch.cancel();
    filterDraft = { ...filterDraft, [key]: value };
    applyFilters();
  }

  function setSearch(value: string) {
    filterDraft = { ...filterDraft, q: value };
    applySearch();
  }

  function clearFilters() {
    applySearch.cancel();
    filterDraft = { ...EMPTY_INVOICE_FILTERS };
    applyFilters();
  }

  let view = $state<'list' | 'chart'>('list');

  let activeTrendKeys = $state(['paid', 'pending', 'overdue']);
  function toggleTrendBadge(key: string) {
    activeTrendKeys = activeTrendKeys.includes(key)
      ? activeTrendKeys.filter(k => k !== key)
      : [...activeTrendKeys, key];
  }
  const trendSeries = $derived(
    data.trendData.series
      .filter(s => activeTrendKeys.includes(s.key))
      .map(s => ({ key: s.key, label: $t(s.labelKey), color: s.color, values: s.values }))
  );

  let checkedIds = $state<Set<number>>(new Set());
  const allChecked  = $derived(invoices.length > 0 && checkedIds.size === invoices.length);
  const someChecked = $derived(checkedIds.size > 0 && checkedIds.size < invoices.length);
  const bulkVisible = $derived(checkedIds.size > 0);

  function toggleCheck(id: number, checked: boolean) {
    const next = new Set(checkedIds);
    if (checked) next.add(id); else next.delete(id);
    checkedIds = next;
  }
  function toggleAll(checked: boolean) {
    checkedIds = checked ? new Set(invoices.map((i: { id: number }) => i.id)) : new Set();
  }

  let openIds = $state<Set<number>>(new Set());
  function toggleDrawer(id: number) {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    openIds = next;
  }

  let noteText = $state<Record<number, string>>({});
  let noteSavedFlash = $state<Record<number, boolean>>({});

  function getNoteText(id: number, fallback: string | null) {
    return noteText[id] !== undefined ? noteText[id] : (fallback ?? '');
  }
  function setNoteText(id: number, value: string) {
    noteText = { ...noteText, [id]: value };
  }
  async function saveNote(invoiceId: number) {
    const note = getNoteText(invoiceId, null);
    const body = new FormData();
    body.append('id', String(invoiceId));
    body.append('note', note);
    const resp = await fetch('?/saveNote', { method: 'POST', body });
    if (resp.ok) {
      noteSavedFlash = { ...noteSavedFlash, [invoiceId]: true };
      setTimeout(() => { noteSavedFlash = { ...noteSavedFlash, [invoiceId]: false }; }, 2000);
    }
  }

  let confirmPaidOpen        = $state(false);
  let confirmDeleteOpen      = $state(false);
  let deleteInvoiceId        = $state<number | null>(null);
  let confirmDeleteOneOpen   = $state(false);

  function handleBulkPaid() {
    if (!checkedIds.size) return;
    confirmPaidOpen = true;
  }
  function handleBulkDelete() {
    if (!checkedIds.size) return;
    confirmDeleteOpen = true;
  }
  function executeBulkPaid() {
    (document.getElementById('bulk-paid-form') as HTMLFormElement).submit();
  }
  function executeBulkDelete() {
    (document.getElementById('bulk-delete-form') as HTMLFormElement).submit();
  }
  function requestDeleteInvoice(id: number) {
    deleteInvoiceId = id;
    confirmDeleteOneOpen = true;
  }
  function executeDeleteInvoice() {
    if (deleteInvoiceId == null) return;
    (document.getElementById(`delete-form-${deleteInvoiceId}`) as HTMLFormElement).submit();
    deleteInvoiceId = null;
  }
</script>

{#if showSavedToast}
  <div
    role="status"
    aria-live="polite"
    style="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom,0px));
           z-index:90;width:min(420px,calc(100vw - 32px));"
  >
    <div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px;box-shadow:0 8px 32px rgba(0,0,0,0.18);">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="color:var(--mep-pos);flex-shrink:0;"><Check size={16} /></span>
        <div style="flex:1;min-width:0;">
          <div class="body-strong" style="font-size:13.5px;">{$t('saved.title')}</div>
          <div class="body text-fg-3" style="font-size:12px;">{$ti('saved.desc', { id: data.savedInvoiceId ?? 0 })}</div>
        </div>
        <button
          type="button"
          class="btn btn-ghost"
          style="width:24px;height:24px;padding:0;justify-content:center;flex-shrink:0;"
          aria-label={$t('action.cancel')}
          onclick={() => (toastDismissed = true)}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {#each data.savedAlerts as alert}
        <div class="card p-2 bg-warn-soft border-warn text-warn" style="font-size:12.5px;">{alert}</div>
      {/each}
    </div>
  </div>
{/if}

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileInvoiceList invoices={invoices} q={filterDraft.q} onSearch={setSearch} />
</div>

<div class="hidden md:block p-6">
  {#if data.conflict}
    <div class="card p-3 text-neg" role="alert" style="font-size:13px;margin-bottom:16px;">{$t('inv.conflict')}</div>
  {/if}

  <ListPageTemplate
    dataCoach="invoices-main"
    bind:view
    viewLabels={{ list: $t('tpl.view.list'), chart: $t('tpl.view.chart') }}
    kpis={[
      { key: 'pending',   label: $t('inv.kpi.pending'),   value: Math.round(stats.pending_amount) + ' €', sub: $tp('misc.invoice', stats.pending_count), variant: stats.pending_count > 0 ? 'warn' : 'default' },
      { key: 'overdue',   label: $t('inv.kpi.overdue'),   value: stats.overdue_count, sub: $t('dash.kpi.overdue.sub'), variant: stats.overdue_count > 0 ? 'neg' : 'default' },
      { key: 'paid',      label: $t('inv.kpi.paid'),      value: stats.paid_count, sub: $t('misc.invoices'), variant: 'pos' },
      { key: 'suppliers', label: $t('inv.kpi.suppliers'), value: stats.supplier_count, sub: $t('dash.kpi.active') },
    ]}
    trendTitle={$t('inv.trend.title')}
    trendBadges={data.trendData.series.map(s => ({ key: s.key, label: $t(s.labelKey), color: s.color, active: activeTrendKeys.includes(s.key) }))}
    onToggleTrendBadge={toggleTrendBadge}
    trendXLabels={data.trendData.xLabels}
    {trendSeries}
    trendValueFormatter={fmtEur}
    trendEmptyLabel={$t('tpl.trend.empty')}
  >
    {#snippet topBar()}
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" class="btn btn-ghost"
            style="height:32px;font-size:12.5px;gap:6px;"
            aria-expanded={filtersOpen}
            aria-controls="inv-filter-panel"
            onclick={() => (filtersOpen = !filtersOpen)}>
            <SlidersHorizontal size={13} />
            {$t('inv.filter.toggle')}
            {#if activeCount > 0}
              <span class="badge bg-acc-soft text-acc border border-acc"
                aria-label={$ti('inv.filter.activeCount', { n: activeCount })}
                style="min-width:18px;height:18px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;">
                {activeCount}
              </span>
            {/if}
            <span style="display:inline-flex;transition:transform 150ms;{filtersOpen ? 'transform:rotate(180deg);' : ''}">
              <ChevronDown size={13} />
            </span>
          </button>

          {#if activeCount > 0}
            <button type="button" class="btn btn-ghost" style="height:32px;font-size:12.5px;" onclick={clearFilters}>
              {$t('inv.filter.clear')}
            </button>
          {/if}
        </div>

        <div id="inv-filter-panel">
          {#if filtersOpen}
            <div class="flex flex-wrap items-end gap-3">

              <div class="flex flex-col gap-1">
                <label class="label" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-3);" for="inv-q">{$t('inv.filter.search')}</label>
                <div class="search-field">
                  <span class="search-icon"><Search size={13} /></span>
                  <input id="inv-q" type="search" class="input"
                    style="height:32px;font-size:12.5px;padding-left:32px;min-width:200px;"
                    placeholder={$t('inv.searchPlaceholder')}
                    value={filterDraft.q}
                    oninput={(e) => setSearch((e.target as HTMLInputElement).value)} />
                </div>
              </div>

              <div class="flex flex-col gap-1">
                <label class="label" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-3);" for="inv-supplier">{$t('inv.filter.supplier')}</label>
                <select id="inv-supplier" class="input" style="height:32px;font-size:12.5px;padding:0 8px;min-width:160px;"
                  value={filterDraft.supplier_id}
                  onchange={(e) => setFilter('supplier_id', (e.target as HTMLSelectElement).value)}>
                  <option value="">{$t('inv.filter.all')}</option>
                  {#each suppliers as s}
                    <option value={String(s.id)}>{s.name}</option>
                  {/each}
                </select>
              </div>

              <div class="flex flex-col gap-1">
                <label class="label" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-3);" for="inv-status">{$t('inv.filter.status')}</label>
                <select id="inv-status" class="input" style="height:32px;font-size:12.5px;padding:0 8px;"
                  value={filterDraft.status}
                  onchange={(e) => setFilter('status', (e.target as HTMLSelectElement).value)}>
                  <option value="">{$t('inv.filter.allStatus')}</option>
                  <option value="pending">{$t('status.pending')}</option>
                  <option value="paid">{$t('status.paid')}</option>
                  <option value="overdue">{$t('status.overdue')}</option>
                </select>
              </div>

              <div class="flex flex-col gap-1">
                <label class="label" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-3);" for="inv-from">{$t('inv.filter.from')}</label>
                <input id="inv-from" type="date" class="input" style="height:32px;font-size:12.5px;padding:0 8px;"
                  value={filterDraft.date_from}
                  onchange={(e) => setFilter('date_from', (e.target as HTMLInputElement).value)} />
              </div>

              <div class="flex flex-col gap-1">
                <label class="label" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-3);" for="inv-to">{$t('inv.filter.to')}</label>
                <input id="inv-to" type="date" class="input" style="height:32px;font-size:12.5px;padding:0 8px;"
                  value={filterDraft.date_to}
                  onchange={(e) => setFilter('date_to', (e.target as HTMLInputElement).value)} />
              </div>

              <div class="flex flex-col gap-1">
                <label class="label" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-3);" for="inv-uploaded-from">{$t('inv.filter.uploadedFrom')}</label>
                <input id="inv-uploaded-from" type="date" class="input" style="height:32px;font-size:12.5px;padding:0 8px;"
                  value={filterDraft.uploaded_from}
                  onchange={(e) => setFilter('uploaded_from', (e.target as HTMLInputElement).value)} />
              </div>

              <div class="flex flex-col gap-1">
                <label class="label" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-3);" for="inv-uploaded-to">{$t('inv.filter.uploadedTo')}</label>
                <input id="inv-uploaded-to" type="date" class="input" style="height:32px;font-size:12.5px;padding:0 8px;"
                  value={filterDraft.uploaded_to}
                  onchange={(e) => setFilter('uploaded_to', (e.target as HTMLInputElement).value)} />
              </div>

              <div class="flex flex-col gap-1">
                <label class="label" style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-3);" for="inv-sort">{$t('inv.filter.sort')}</label>
                <select id="inv-sort" class="input" style="height:32px;font-size:12.5px;padding:0 8px;min-width:185px;"
                  value={filterDraft.sort}
                  onchange={(e) => setFilter('sort', (e.target as HTMLSelectElement).value as InvoiceSortKey)}>
                  <option value="uploaded_desc">{$t('inv.filter.sort.uploadedDesc')}</option>
                  <option value="uploaded_asc">{$t('inv.filter.sort.uploadedAsc')}</option>
                  <option value="invoice_date_desc">{$t('inv.filter.sort.invoiceDateDesc')}</option>
                  <option value="invoice_date_asc">{$t('inv.filter.sort.invoiceDateAsc')}</option>
                </select>
              </div>

            </div>
          {/if}
        </div>
      </div>
    {/snippet}

    {#snippet filters()}
      <div style="flex:1;"></div>
      <a href="/invoices/export" class="btn btn-ghost" style="height:32px;font-size:12px;gap:5px;text-decoration:none;flex-shrink:0;">
        <FileDown size={13} />
        {$t('inv.export')}
      </a>
    {/snippet}

    {#snippet table()}
      {#if invoices.length === 0}
        <p class="body text-center py-16">{$t('inv.noInvoices')}</p>
      {:else}
        <form id="bulk-paid-form" method="post" action="?/bulkPaid" class="hidden">
          {#each [...checkedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
        </form>
        <form id="bulk-delete-form" method="post" action="?/bulkDelete" class="hidden">
          {#each [...checkedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
        </form>

        <div class="flex items-center gap-3 px-4 py-2 border-b border-divider min-h-[40px]">
          <label class="flex items-center gap-2 body text-fg-2 cursor-pointer select-none" style="font-size:12.5px;">
            <input type="checkbox" checked={allChecked} indeterminate={someChecked}
              class="cursor-pointer accent-acc shrink-0"
              onchange={(e) => toggleAll((e.target as HTMLInputElement).checked)} />
            {$t('inv.selectAll')}
          </label>

          {#if bulkVisible}
            <div class="flex items-center gap-2 bg-acc-soft border border-acc rounded-lg px-3 py-1.5 transition-all">
              <span class="body-strong text-acc" style="font-size:12px;">{checkedIds.size} {$t('inv.selected')}</span>
              <div class="w-px h-4 bg-divider"></div>
              <button type="button" onclick={handleBulkPaid}
                class="btn btn-ghost text-pos" style="height:26px;font-size:12px;padding:0 8px;gap:4px;">
                <Check size={12} />
                {$t('inv.markPaid')}
              </button>
              <button type="button" onclick={handleBulkDelete}
                class="btn btn-ghost text-neg" style="height:26px;font-size:12px;padding:0 8px;gap:4px;">
                <Trash2 size={12} />
                {$t('inv.delete')}
              </button>
            </div>
          {/if}
        </div>

        <div class="grid gap-3 p-4 xl:grid-cols-2">
        {#each invoices as inv (inv.id)}
          {@const noteVal = getNoteText(inv.id, inv.notes)}
          {@const expanded = openIds.has(inv.id)}

          <div class="border border-divider rounded-lg overflow-hidden {expanded ? 'xl:col-span-2' : ''}">
            <button type="button"
              class="grid items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-hover transition-colors
                     grid-cols-[auto_minmax(0,1fr)_95px_100px_110px_32px] max-[800px]:grid-cols-[auto_minmax(0,1fr)_auto]"
              style="width:100%;text-align:left;background:transparent;border:none;font:inherit;color:inherit;"
              onclick={() => toggleDrawer(inv.id)}>

              <input type="checkbox"
                class="cursor-pointer accent-acc shrink-0"
                checked={checkedIds.has(inv.id)}
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
                onchange={(e) => toggleCheck(inv.id, (e.target as HTMLInputElement).checked)} />

              <div class="min-w-0">
                <div class="body-strong overflow-hidden text-ellipsis whitespace-nowrap">{inv.supplier_name ?? '—'}</div>
                <div class="body text-fg-3 overflow-hidden text-ellipsis whitespace-nowrap" style="font-size:11.5px;">
                  {inv.invoice_number ?? '—'} · {inv.invoice_date ?? '—'}
                  <span class="text-fg-4">· {$t('inv.uploadedOn')} {inv.created_at ? fmtDateShort(inv.created_at.toISOString(), $locale) : '—'}</span>
                </div>
              </div>

              <div class="body text-fg-3 max-[800px]:hidden" style="font-size:12px;">
                {inv.due_date ?? '—'}
              </div>

              <div class="num text-right font-semibold" style="font-size:13px;">
                {fmt(inv.total_amount)} <span class="text-fg-3" style="font-weight:400;font-size:11px;">EUR</span>
              </div>

              <div class="max-[800px]:hidden">
                <StatusBadge status={inv.status ?? 'pending'} />
              </div>

              <div class="flex justify-end text-fg-3 transition-transform {expanded ? 'rotate-90' : ''}">
                <ChevronRight size={15} />
              </div>
            </button>

            {#if expanded}
              <div class="bg-surface-2 border-t border-divider px-4 py-4 flex flex-col gap-4"
                role="presentation" onclick={(e) => e.stopPropagation()}>

                <div class="flex items-center gap-2 flex-wrap">
                  <a href="/invoice/{inv.id}" class="btn btn-ghost" style="height:28px;font-size:12px;gap:5px;text-decoration:none;">
                    <Eye size={12} />
                    {$t('inv.viewDetail')}
                  </a>
                  {#if inv.source_file}
                    <a href="/invoice/{inv.id}/file" target="_blank" rel="noopener noreferrer"
                      class="btn btn-ghost" style="height:28px;font-size:12px;gap:5px;text-decoration:none;">
                      <ExternalLink size={12} />
                      {$t('inv.detail.original')}
                    </a>
                  {/if}
                  {#if inv.status === 'pending'}
                    <form method="post" action="?/markPaid">
                      <input type="hidden" name="id" value={inv.id} />
                      <button type="submit" class="btn btn-ghost text-pos" style="height:28px;font-size:12px;gap:5px;">
                        <Check size={12} />
                        {$t('inv.markPaid')}
                      </button>
                    </form>
                  {:else}
                    <form method="post" action="?/markUnpaid">
                      <input type="hidden" name="id" value={inv.id} />
                      <button type="submit" class="btn btn-ghost text-fg-2" style="height:28px;font-size:12px;gap:5px;">
                        <RotateCcw size={12} />
                        {$t('inv.markUnpaid')}
                      </button>
                    </form>
                  {/if}
                  <a href="/invoice/{inv.id}/edit" class="btn btn-ghost" style="height:28px;font-size:12px;text-decoration:none;">
                    {$t('action.edit')}
                  </a>
                  <form id="delete-form-{inv.id}" method="post" action="?/deleteInvoice">
                    <input type="hidden" name="id" value={inv.id} />
                    <button type="button" class="btn btn-ghost text-neg" style="height:28px;font-size:12px;gap:5px;"
                      onclick={() => requestDeleteInvoice(inv.id)}>
                      <Trash2 size={12} />
                      {$t('inv.delete')}
                    </button>
                  </form>
                </div>

                {#if inv.line_items.length > 0}
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>{$t('tbl.desc')}</th>
                        <th class="num">{$t('tbl.qty')}</th>
                        <th>{$t('tbl.unit')}</th>
                        <th class="num">{$t('tbl.unitPrice')}</th>
                        <th class="num">{$t('tbl.total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each inv.line_items as item}
                        <tr class="row">
                          <td>{item.description ?? '—'}</td>
                          <td class="num">{item.quantity ?? '—'}</td>
                          <td>{item.unit ?? '—'}</td>
                          <td class="num">{item.unit_price != null ? fmt(item.unit_price) : '—'}</td>
                          <td class="num font-semibold">{item.total_price != null ? fmt(item.total_price) : '—'}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {:else}
                  <p class="body">{$t('inv.detail.noLines')}</p>
                {/if}

                <div class="flex flex-col gap-1.5">
                  <span class="label">{$t('inv.detail.notes')}</span>
                  <textarea
                    maxlength={250}
                    placeholder={$t('inv.detail.addNote')}
                    value={noteVal}
                    class="input resize-y"
                    style="min-height:52px;max-height:120px;padding:8px 10px;font-size:12.5px;"
                    oninput={(e: Event) => setNoteText(inv.id, (e.target as HTMLTextAreaElement).value)}
                    onblur={() => saveNote(inv.id)}
                  ></textarea>
                  <div class="flex justify-between items-center">
                    <span class="body text-pos transition-opacity duration-300 {noteSavedFlash[inv.id] ? 'opacity-100' : 'opacity-0'}"
                      style="font-size:11px;">{$t('inv.detail.saved')}</span>
                    <span class="body text-fg-3" style="font-size:11px;">{noteVal.length}/250</span>
                  </div>
                </div>

              </div>
            {/if}
          </div>
        {/each}
        </div>
      {/if}

      {#if pagination.totalPages > 1}
        <div class="flex items-center justify-between px-4 py-3 border-t border-divider">
          <span class="body text-fg-3" style="font-size:12px;">
            {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} / {pagination.total}
          </span>
          <div class="flex items-center gap-1">
            <a href={pageUrl(pagination.page - 1)}
              class="btn btn-ghost {pagination.page <= 1 ? 'opacity-30 pointer-events-none' : ''}"
              style="height:30px;width:30px;padding:0;display:flex;align-items:center;justify-content:center;"
              aria-disabled={pagination.page <= 1}>
              <ChevronLeft size={14} />
            </a>
            <span class="body" style="font-size:12px;padding:0 8px;">{pagination.page} / {pagination.totalPages}</span>
            <a href={pageUrl(pagination.page + 1)}
              class="btn btn-ghost {pagination.page >= pagination.totalPages ? 'opacity-30 pointer-events-none' : ''}"
              style="height:30px;width:30px;padding:0;display:flex;align-items:center;justify-content:center;"
              aria-disabled={pagination.page >= pagination.totalPages}>
              <ChevronRight size={14} />
            </a>
          </div>
        </div>
      {/if}
    {/snippet}
  </ListPageTemplate>
</div>

<ConfirmDialog
  bind:open={confirmPaidOpen}
  message={$tp('inv.confirm.paid', checkedIds.size)}
  onconfirm={executeBulkPaid}
/>
<ConfirmDialog
  bind:open={confirmDeleteOpen}
  message={$tp('inv.confirm.delete', checkedIds.size)}
  danger={true}
  onconfirm={executeBulkDelete}
/>
<ConfirmDialog
  bind:open={confirmDeleteOneOpen}
  message={$t('inv.confirm.del1')}
  danger={true}
  onconfirm={executeDeleteInvoice}
  oncancel={() => { deleteInvoiceId = null; }}
/>
