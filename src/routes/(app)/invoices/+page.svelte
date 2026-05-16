<script lang="ts">
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();
  const { invoices, stats, suppliers, filters } = $derived(data);
  const hasFilters = $derived(!!(filters.status || filters.supplier_id || filters.date_from || filters.date_to));

  let checkedIds = $state<Set<number>>(new Set());
  const allChecked = $derived(invoices.length > 0 && checkedIds.size === invoices.length);
  const someChecked = $derived(checkedIds.size > 0 && checkedIds.size < invoices.length);
  const bulkVisible = $derived(checkedIds.size > 0);

  function toggleCheck(id: number, checked: boolean) {
    const next = new Set(checkedIds);
    if (checked) next.add(id); else next.delete(id);
    checkedIds = next;
  }
  function toggleAll(checked: boolean) {
    checkedIds = checked ? new Set(invoices.map(i => i.id)) : new Set();
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

  function fmt(n: number | null) { return (n ?? 0).toFixed(2); }

  function handleBulkPaid() {
    if (!checkedIds.size) return;
    if (!confirm(`Mark ${checkedIds.size} invoice${checkedIds.size > 1 ? 's' : ''} as paid?`)) return;
    (document.getElementById('bulk-paid-form') as HTMLFormElement).submit();
  }
  function handleBulkDelete() {
    if (!checkedIds.size) return;
    if (!confirm(`Delete ${checkedIds.size} invoice${checkedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    (document.getElementById('bulk-delete-form') as HTMLFormElement).submit();
  }

  const badgeCls: Record<string, string> = {
    pending:  'bg-[#FFF8EE] text-[#C8843A]',
    paid:     'bg-[#F0FDF4] text-[#3A8C5C]',
    overdue:  'bg-[#FFF1F0] text-[#E05555]',
    due_soon: 'bg-[#FFF8EE] text-[#C8843A]',
  };
</script>

<div class="flex justify-end mb-4">
  <a href="/invoices/export"
     class="h-8 flex items-center border border-[#E5E7EB] bg-white rounded-[8px] px-3 text-[12px] font-medium text-[#666666] no-underline hover:bg-[#F9FAFB] transition-colors">
    Export CSV
  </a>
</div>

<!-- Stats -->
<div class="grid grid-cols-4 gap-3 mb-5 max-md:grid-cols-2">
  {#each [
    { label: 'Pending', value: Math.round(stats.pending_amount), sub: `EUR · ${stats.pending_count} invoice${stats.pending_count !== 1 ? 's' : ''}`, danger: stats.overdue_count > 0 },
    { label: 'Overdue', value: stats.overdue_count, sub: 'past due date', danger: stats.overdue_count > 0 },
    { label: 'Paid', value: stats.paid_count, sub: 'invoices', danger: false },
    { label: 'Suppliers', value: stats.supplier_count, sub: 'active', danger: false },
  ] as s}
    <div class="bg-white rounded-[8px] border border-[#E5E7EB] py-3 px-4 {s.danger ? 'border-l-4 border-l-[#E05555]' : ''}">
      <p class="text-[11px] font-bold tracking-[0.07em] uppercase text-[#888888] mb-1">{s.label}</p>
      <p class="text-[20px] font-bold leading-none {s.danger ? 'text-[#E05555]' : 'text-[#1A1A1A]'}">{s.value}</p>
      <p class="text-[11px] text-[#888888] mt-1">{s.sub}</p>
    </div>
  {/each}
</div>

<!-- Filters -->
<form method="get" action="/invoices" class="flex gap-2 flex-wrap items-end mb-3 max-md:flex-col max-md:items-stretch">
  <div>
    <label class="block text-[11px] font-semibold text-[#888888] uppercase tracking-[0.05em] mb-1" for="inv-supplier">Supplier</label>
    <select id="inv-supplier" name="supplier_id"
            class="h-8 rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]">
      <option value="">All suppliers</option>
      {#each suppliers as s}
        <option value={s.id} selected={filters.supplier_id === String(s.id)}>{s.name}</option>
      {/each}
    </select>
  </div>
  <div>
    <label class="block text-[11px] font-semibold text-[#888888] uppercase tracking-[0.05em] mb-1" for="inv-status">Status</label>
    <select id="inv-status" name="status"
            class="h-8 rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]">
      <option value="" selected={!filters.status}>All</option>
      <option value="pending" selected={filters.status === 'pending'}>Pending</option>
      <option value="paid" selected={filters.status === 'paid'}>Paid</option>
    </select>
  </div>
  <div>
    <label class="block text-[11px] font-semibold text-[#888888] uppercase tracking-[0.05em] mb-1" for="inv-from">From</label>
    <input id="inv-from" type="date" name="date_from" value={filters.date_from}
           class="h-8 rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]" />
  </div>
  <div>
    <label class="block text-[11px] font-semibold text-[#888888] uppercase tracking-[0.05em] mb-1" for="inv-to">To</label>
    <input id="inv-to" type="date" name="date_to" value={filters.date_to}
           class="h-8 rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]" />
  </div>
  <button type="submit"
          class="h-8 bg-[#4A9FD8] text-white rounded-[8px] px-3 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
    Filter
  </button>
  {#if hasFilters}
    <a href="/invoices"
       class="h-8 flex items-center border border-[#E5E7EB] rounded-[8px] px-3 text-[13px] text-[#888888] bg-white no-underline hover:bg-[#F9FAFB] transition-colors">
      Clear
    </a>
  {/if}
</form>

{#if invoices.length === 0}
  <p class="text-center py-16 text-[#888888] text-[13px]">No invoices saved yet.</p>
{:else}
  <!-- Hidden bulk forms -->
  <form id="bulk-paid-form" method="post" action="?/bulkPaid" class="hidden">
    {#each [...checkedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
  </form>
  <form id="bulk-delete-form" method="post" action="?/bulkDelete" class="hidden">
    {#each [...checkedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
  </form>

  <!-- Select toolbar -->
  <div class="flex items-center gap-3 mb-2 min-h-8">
    <label class="flex items-center gap-2 text-[13px] text-[#888888] cursor-pointer select-none">
      <input type="checkbox" checked={allChecked} indeterminate={someChecked}
             class="cursor-pointer w-[15px] h-[15px] accent-[#4A9FD8] shrink-0"
             onchange={(e) => toggleAll((e.target as HTMLInputElement).checked)} />
      Select all
    </label>
    <div class="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-[8px] py-[5px] px-3 text-[13px]
                transition-all duration-[180ms]
                {bulkVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}">
      <span class="font-semibold text-[#1A1A1A] mr-1">{checkedIds.size} selected</span>
      <button type="button" onclick={handleBulkPaid}
              class="bg-[#F0FDF4] text-[#3A8C5C] border-none rounded-[6px] py-1 px-3 text-[12px] font-semibold cursor-pointer hover:bg-[#DCFCE7] transition-colors">
        ✓ Mark paid
      </button>
      <button type="button" onclick={handleBulkDelete}
              class="bg-[#FFF1F0] text-[#E05555] border-none rounded-[6px] py-1 px-3 text-[12px] font-semibold cursor-pointer hover:bg-[#FFE4E4] transition-colors">
        ✕ Delete
      </button>
    </div>
  </div>

  {#each invoices as inv (inv.id)}
    {@const noteVal = getNoteText(inv.id, inv.notes)}
    <div class="bg-white rounded-[8px] border border-[#E5E7EB] mb-2 overflow-hidden">
      <div role="button" tabindex="0"
           class="grid grid-cols-[minmax(0,1fr)_95px_95px_120px_72px_auto] items-center px-4 py-3 gap-2 cursor-pointer select-none hover:bg-[#FAFAFA] transition-colors
                  max-md:grid-cols-[minmax(0,1fr)_auto] max-md:grid-rows-2"
           onclick={() => toggleDrawer(inv.id)}
           onkeydown={(e) => e.key === 'Enter' && toggleDrawer(inv.id)}>
        <div class="flex items-start gap-2">
          <input type="checkbox" class="cursor-pointer w-[15px] h-[15px] accent-[#4A9FD8] shrink-0 mt-[2px]"
                 checked={checkedIds.has(inv.id)}
                 onclick={(e) => e.stopPropagation()}
                 onkeydown={(e) => e.stopPropagation()}
                 onchange={(e) => toggleCheck(inv.id, (e.target as HTMLInputElement).checked)} />
          <div>
            <p class="font-semibold text-[13px] text-[#1A1A1A]">{inv.supplier_name ?? '—'}</p>
            <p class="text-[12px] text-[#888888]">{inv.invoice_number ?? 'No invoice #'} · {inv.source_file ?? ''}</p>
          </div>
        </div>
        <p class="text-[12px] text-[#888888] max-md:hidden">{inv.invoice_date ?? '—'}</p>
        <p class="text-[12px] text-[#888888] max-md:hidden">Due: {inv.due_date ?? '—'}</p>
        <div class="text-right max-md:col-start-2 max-md:row-start-1">
          <span class="font-bold text-[13px] text-[#1A1A1A]">{fmt(inv.total_amount)}</span>
          <span class="text-[12px] text-[#888888]"> EUR</span>
        </div>
        <div class="max-md:hidden">
          <span class="text-[10px] font-semibold px-2 py-[2px] rounded-full {badgeCls[inv.status ?? 'pending'] ?? 'bg-[#F3F4F6] text-[#666666]'}">
            {inv.status ?? 'pending'}
          </span>
        </div>
        <div role="presentation"
             class="flex gap-1 justify-end items-center max-md:col-span-2 max-md:row-start-2 max-md:border-t max-md:border-[#F3F4F6] max-md:pt-2"
             onclick={(e) => e.stopPropagation()}>
          {#if inv.status === 'pending'}
            <form method="post" action="?/markPaid">
              <input type="hidden" name="id" value={inv.id} />
              <button type="submit"
                      class="text-[12px] font-semibold py-1 px-3 rounded-[6px] bg-[#F0FDF4] text-[#3A8C5C] border-none cursor-pointer hover:bg-[#DCFCE7] transition-colors whitespace-nowrap">
                ✓ Mark paid
              </button>
            </form>
          {:else}
            <form method="post" action="?/markUnpaid">
              <input type="hidden" name="id" value={inv.id} />
              <button type="submit"
                      class="text-[12px] font-semibold py-1 px-3 rounded-[6px] bg-[#F9FAFB] text-[#888888] border-none cursor-pointer hover:bg-[#F3F4F6] transition-colors whitespace-nowrap">
                ↺ Revert
              </button>
            </form>
          {/if}
          <a href="/invoice/{inv.id}/edit"
             class="w-7 h-7 rounded-[6px] border border-[#E5E7EB] bg-white flex items-center justify-center no-underline text-[#888888] text-[13px] hover:bg-[#F9FAFB] transition-colors"
             title="Edit">✎</a>
          <form method="post" action="?/deleteInvoice" onsubmit={(e) => { if (!confirm('Delete this invoice? This cannot be undone.')) e.preventDefault(); }}>
            <input type="hidden" name="id" value={inv.id} />
            <button type="submit"
                    class="w-7 h-7 rounded-[6px] border border-[#FECACA] bg-white flex items-center justify-center text-[#E05555] text-[13px] cursor-pointer hover:bg-[#FFF1F0] transition-colors"
                    title="Delete">✕</button>
          </form>
        </div>
      </div>

      {#if openIds.has(inv.id)}
        <div class="border-t border-[#F3F4F6] px-4 py-4">
          {#if inv.source_file}
            <div class="pb-3">
              <a href="/invoice/{inv.id}/file" target="_blank" rel="noopener noreferrer"
                 class="text-[12px] border border-[#E5E7EB] rounded-[6px] py-1 px-3 text-[#666666] no-underline bg-white hover:bg-[#F9FAFB] transition-colors">
                See original
              </a>
            </div>
          {/if}

          {#if inv.line_items.length > 0}
            <table class="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {#each ['Description','Qty','Unit','Unit Price','Total'] as h}
                    <th class="text-left py-2 px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#888888] border-b border-[#E5E7EB]">{h}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each inv.line_items as item}
                  <tr>
                    <td class="py-2 px-2 border-b border-[#F3F4F6] text-[#666666]">{item.description ?? '—'}</td>
                    <td class="py-2 px-2 border-b border-[#F3F4F6] text-[#666666]">{item.quantity ?? '—'}</td>
                    <td class="py-2 px-2 border-b border-[#F3F4F6] text-[#666666]">{item.unit ?? '—'}</td>
                    <td class="py-2 px-2 border-b border-[#F3F4F6] text-[#666666]">{item.unit_price ?? '—'}</td>
                    <td class="py-2 px-2 border-b border-[#F3F4F6] text-[#666666]">{item.total_price ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p class="text-[#888888] text-[13px]">No line items recorded.</p>
          {/if}

          <div class="mt-4 pt-3 border-t border-[#F3F4F6]">
            <p class="text-[11px] font-bold tracking-[0.05em] uppercase text-[#888888] mb-2">Notes</p>
            <textarea
              maxlength={250}
              placeholder="Add a note…"
              value={noteVal}
              class="w-full resize-y min-h-[56px] max-h-[120px] text-[13px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-[6px] px-3 py-2 text-[#1A1A1A] placeholder:text-[#BBBBBB] focus:outline-none focus:border-[#4A9FD8]"
              oninput={(e: Event) => setNoteText(inv.id, (e.target as HTMLTextAreaElement).value)}
              onblur={() => saveNote(inv.id)}
            ></textarea>
            <div class="flex justify-between items-center mt-1">
              <span class="text-[11px] text-[#3A8C5C] transition-opacity duration-300 {noteSavedFlash[inv.id] ? 'opacity-100' : 'opacity-0'}">Saved</span>
              <span class="text-[11px] text-[#888888]">{noteVal.length}/250</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/each}
{/if}
