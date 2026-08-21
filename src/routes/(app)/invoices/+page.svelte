<script lang="ts">
  import type { PageData } from './$types';
  import { fmt, fmtDateShort } from '$lib/formatters';
  import { t, ti, tp, locale } from '$lib/i18n';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import MobileInvoiceList from '$lib/components/mobile/MobileInvoiceList.svelte';
  import ConfirmDialog from '$lib/components/mep/ConfirmDialog.svelte';
  import PeriodPills from '$lib/components/mep/PeriodPills.svelte';
  import DateField from '$lib/components/mep/DateField.svelte';
  import Search from '@lucide/svelte/icons/search';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FileDown from '@lucide/svelte/icons/file-down';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Check from '@lucide/svelte/icons/check';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Eye from '@lucide/svelte/icons/eye';

  const { data }: { data: PageData } = $props();
  const { invoices, stats, suppliers, filters, pagination, period } = $derived(data);

  const PERIODS: Array<['day' | 'month' | 'year' | 'all', string]> = [
    ['day',   'inv.period.day'],
    ['month', 'inv.period.month'],
    ['year',  'inv.period.year'],
    ['all',   'inv.period.all'],
  ];

  let toastDismissed = $state(false);
  const showSavedToast = $derived(data.savedInvoiceId !== null && !toastDismissed);

  $effect(() => {
    if (!showSavedToast || data.savedAlerts.length > 0) return;
    const timer = setTimeout(() => { toastDismissed = true; }, 6000);
    return () => clearTimeout(timer);
  });

  function sharedParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.q)              params.set('q', filters.q);
    if (filters.status)        params.set('status', filters.status);
    if (filters.supplier_id)   params.set('supplier_id', filters.supplier_id);
    if (filters.date_from)     params.set('date_from', filters.date_from);
    if (filters.date_to)       params.set('date_to', filters.date_to);
    if (filters.uploaded_from) params.set('uploaded_from', filters.uploaded_from);
    if (filters.uploaded_to)   params.set('uploaded_to', filters.uploaded_to);
    if (filters.sort && filters.sort !== 'uploaded_desc') params.set('sort', filters.sort);
    return params;
  }
  function pageUrl(p: number): string {
    const params = sharedParams();
    if (period !== 'month') params.set('period', period);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return '/invoices' + (qs ? '?' + qs : '');
  }
  function periodHref(value: string): string {
    const params = sharedParams();
    params.set('period', value);
    return '/invoices?' + params.toString();
  }
  const hasFilters = $derived(!!(
    filters.q || filters.status || filters.supplier_id || filters.date_from || filters.date_to ||
    filters.uploaded_from || filters.uploaded_to || (filters.sort && filters.sort !== 'uploaded_desc')
  ));

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
  <MobileInvoiceList invoices={invoices} />
</div>

<div class="hidden md:flex flex-col gap-4 p-6">

  {#if data.conflict}
    <div class="card p-3 text-neg" role="alert" style="font-size:13px;">{$t('inv.conflict')}</div>
  {/if}

  <form method="get" action="/invoices" style="display:flex;align-items:center;gap:12px;">
    <div class="search-field">
      <span class="search-icon"><Search size={14} /></span>
      <input class="input" type="text" name="q" value={filters.q} placeholder={$t('inv.search')} />
    </div>
    {#if filters.status}<input type="hidden" name="status" value={filters.status} />{/if}
    {#if filters.supplier_id}<input type="hidden" name="supplier_id" value={filters.supplier_id} />{/if}
    {#if filters.date_from}<input type="hidden" name="date_from" value={filters.date_from} />{/if}
    {#if filters.date_to}<input type="hidden" name="date_to" value={filters.date_to} />{/if}
    {#if filters.uploaded_from}<input type="hidden" name="uploaded_from" value={filters.uploaded_from} />{/if}
    {#if filters.uploaded_to}<input type="hidden" name="uploaded_to" value={filters.uploaded_to} />{/if}
    {#if filters.sort && filters.sort !== 'uploaded_desc'}<input type="hidden" name="sort" value={filters.sort} />{/if}
    <input type="hidden" name="period" value={period} />
    <PeriodPills active={period} pills={PERIODS.map(([val, labelKey]) => ({ value: val, label: $t(labelKey), href: periodHref(val) }))} />
  </form>

  <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1" data-coach="invoices-main">
    <KpiCard
      label={$t('inv.kpi.uploaded')}
      value={stats.total_count}
      sub={period === 'all' ? $t('inv.kpi.totalSub') : undefined}
      delta={stats.count_delta_pct !== null ? Math.round(stats.count_delta_pct * 10) / 10 : undefined}
      deltaCtx={stats.count_delta_pct !== null ? $t('inv.kpi.vsPrev') : undefined}
      spark={stats.count_spark ?? undefined}
      sparkPrev={stats.count_spark_prev ?? undefined}
    />
    <KpiCard
      label={$t('field.totalAmount')}
      value={Math.round(stats.total_amount) + ' €'}
      sub={period === 'all' ? $t('inv.kpi.amountSub') : undefined}
      delta={stats.amount_delta_pct !== null ? Math.round(stats.amount_delta_pct * 10) / 10 : undefined}
      deltaCtx={stats.amount_delta_pct !== null ? $t('inv.kpi.vsPrev') : undefined}
      spark={stats.amount_spark ?? undefined}
      sparkPrev={stats.amount_spark_prev ?? undefined}
      invert
    />
    <a href="/avisos" style="text-decoration:none;color:inherit;">
      <KpiCard
        label={$t('inv.kpi.needsReview')}
        value={stats.needs_review_count}
        sub={$t('misc.invoices')}
        variant={stats.needs_review_count > 0 ? 'warn' : 'default'}
      />
    </a>
    <KpiCard
      label={$t('inv.kpi.commented')}
      value={stats.commented_count}
      sub={$t('misc.invoices')}
    />
  </div>

  <SectionCard title={$t('inv.list.title')} sub={$t('inv.list.sub')} noPad>
    {#snippet headerRight()}
      <a href="/invoices/export" class="btn btn-ghost" style="height:30px;font-size:12px;gap:5px;text-decoration:none;flex-shrink:0;">
        <FileDown size={13} />
        {$t('inv.export')}
      </a>
    {/snippet}

    <form method="get" action="/invoices"
      class="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-divider max-[700px]:flex-col max-[700px]:items-stretch">
      <input type="hidden" name="q" value={filters.q} />
      <input type="hidden" name="period" value={period} />

      <div class="flex flex-col gap-1 min-w-[140px]">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-supplier">{$t('inv.filter.supplier')}</label>
        <select id="inv-supplier" name="supplier_id" class="input" style="height:32px;font-size:12.5px;padding:0 8px;">
          <option value="">{$t('inv.filter.all')}</option>
          {#each suppliers as s}
            <option value={s.id} selected={filters.supplier_id === String(s.id)}>{s.name}</option>
          {/each}
        </select>
      </div>

      <div class="flex flex-col gap-1 min-w-[110px]">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-status">{$t('inv.filter.status')}</label>
        <select id="inv-status" name="status" class="input" style="height:32px;font-size:12.5px;padding:0 8px;">
          <option value="" selected={!filters.status}>{$t('inv.filter.allStatus')}</option>
          <option value="pending"  selected={filters.status === 'pending'}>{$t('status.pending')}</option>
          <option value="paid"     selected={filters.status === 'paid'}>{$t('status.paid')}</option>
        </select>
      </div>

      <div class="flex flex-col gap-1">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-from">{$t('inv.filter.from')}</label>
        <DateField id="inv-from" name="date_from" value={filters.date_from} label={$t('date.from')} />
      </div>

      <div class="flex flex-col gap-1">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-to">{$t('inv.filter.to')}</label>
        <DateField id="inv-to" name="date_to" value={filters.date_to} label={$t('date.to')} />
      </div>

      <div class="flex flex-col gap-1">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-uploaded-from">{$t('inv.filter.uploadedFrom')}</label>
        <DateField id="inv-uploaded-from" name="uploaded_from" value={filters.uploaded_from} label={$t('date.from')} />
      </div>

      <div class="flex flex-col gap-1">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-uploaded-to">{$t('inv.filter.uploadedTo')}</label>
        <DateField id="inv-uploaded-to" name="uploaded_to" value={filters.uploaded_to} label={$t('date.to')} />
      </div>

      <div class="flex flex-col gap-1 min-w-[170px]">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-sort">{$t('inv.filter.sort')}</label>
        <select id="inv-sort" name="sort" class="input" style="height:32px;font-size:12.5px;padding:0 8px;">
          <option value="uploaded_desc"     selected={filters.sort === 'uploaded_desc'}>{$t('inv.filter.sort.uploadedDesc')}</option>
          <option value="uploaded_asc"      selected={filters.sort === 'uploaded_asc'}>{$t('inv.filter.sort.uploadedAsc')}</option>
          <option value="invoice_date_desc" selected={filters.sort === 'invoice_date_desc'}>{$t('inv.filter.sort.invoiceDateDesc')}</option>
          <option value="invoice_date_asc"  selected={filters.sort === 'invoice_date_asc'}>{$t('inv.filter.sort.invoiceDateAsc')}</option>
        </select>
      </div>

      <div class="flex items-end gap-2">
        <button type="submit" class="btn btn-primary" style="height:32px;font-size:12.5px;">
          {$t('inv.filter.apply')}
        </button>
        {#if hasFilters}
          <a href="/invoices" class="btn btn-ghost" style="height:32px;font-size:12.5px;text-decoration:none;">
            {$t('inv.filter.clear')}
          </a>
        {/if}
      </div>
    </form>

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
                   grid-cols-[auto_minmax(0,1fr)_100px_110px_32px] max-[800px]:grid-cols-[auto_minmax(0,1fr)_auto]"
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
  </SectionCard>

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
