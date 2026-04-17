<script lang="ts">
  import type { PageData } from './$types';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';

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

  const badgeClass: Record<string, string> = {
    pending:  'bg-[var(--color-amber-bg)] text-[var(--color-amber)] border-transparent',
    paid:     'bg-green-50 text-green-700 border-transparent',
    overdue:  'bg-red-50 text-red-700 border-transparent',
    due_soon: 'bg-[var(--color-amber-bg)] text-[var(--color-amber)] border-transparent',
  };
</script>

<div class="flex justify-end mb-3">
  <a href="/invoices/export" class="text-[.78rem] font-medium text-secondary-foreground border border-border bg-card rounded-md px-3 py-[.38rem] no-underline hover:bg-secondary">Export CSV</a>
</div>

<!-- Stats -->
<div class="grid grid-cols-4 gap-3 mb-6 max-md:grid-cols-2">
  {#each [
    { label: 'Pending', value: Math.round(stats.pending_amount), sub: `EUR · ${stats.pending_count} invoice${stats.pending_count !== 1 ? 's' : ''}`, danger: stats.overdue_count > 0 },
    { label: 'Overdue', value: stats.overdue_count, sub: 'past due date', danger: stats.overdue_count > 0 },
    { label: 'Paid', value: stats.paid_count, sub: 'invoices', danger: false },
    { label: 'Suppliers', value: stats.supplier_count, sub: 'active', danger: false },
  ] as s}
    <Card.Root class="py-4 px-[1.1rem]">
      <p class="text-[.65rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-1">{s.label}</p>
      <p class="text-[1.25rem] font-bold leading-none {s.danger ? 'text-destructive' : ''}">{s.value}</p>
      <p class="text-[.68rem] text-muted-foreground mt-1">{s.sub}</p>
    </Card.Root>
  {/each}
</div>

<!-- Filters -->
<form method="get" action="/invoices" class="flex gap-2 flex-wrap items-end mb-3 max-md:flex-col max-md:items-stretch">
  <div>
    <Label class="text-[.72rem] mb-1">Supplier</Label>
    <select name="supplier_id" class="h-8 rounded-md border border-border bg-card px-2 text-[.8rem] font-[inherit] text-foreground focus:outline-none focus:border-primary">
      <option value="">All suppliers</option>
      {#each suppliers as s}
        <option value={s.id} selected={filters.supplier_id === String(s.id)}>{s.name}</option>
      {/each}
    </select>
  </div>
  <div>
    <Label class="text-[.72rem] mb-1">Status</Label>
    <select name="status" class="h-8 rounded-md border border-border bg-card px-2 text-[.8rem] font-[inherit] text-foreground focus:outline-none focus:border-primary">
      <option value="" selected={!filters.status}>All</option>
      <option value="pending" selected={filters.status === 'pending'}>Pending</option>
      <option value="paid" selected={filters.status === 'paid'}>Paid</option>
    </select>
  </div>
  <div>
    <Label class="text-[.72rem] mb-1">From</Label>
    <input type="date" name="date_from" value={filters.date_from} class="h-8 rounded-md border border-border bg-card px-2 text-[.8rem] font-[inherit] text-foreground focus:outline-none focus:border-primary" />
  </div>
  <div>
    <Label class="text-[.72rem] mb-1">To</Label>
    <input type="date" name="date_to" value={filters.date_to} class="h-8 rounded-md border border-border bg-card px-2 text-[.8rem] font-[inherit] text-foreground focus:outline-none focus:border-primary" />
  </div>
  <Button type="submit" class="h-8 text-[.8rem]">Filter</Button>
  {#if hasFilters}
    <a href="/invoices" class="h-8 flex items-center border border-border rounded-md px-3 text-[.8rem] text-secondary-foreground bg-card no-underline hover:bg-secondary">Clear</a>
  {/if}
</form>

{#if invoices.length === 0}
  <p class="text-center py-16 text-muted-foreground text-[.9rem]">No invoices saved yet.</p>
{:else}
  <!-- Hidden bulk forms -->
  <form id="bulk-paid-form" method="post" action="?/bulkPaid" class="hidden">
    {#each [...checkedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
  </form>
  <form id="bulk-delete-form" method="post" action="?/bulkDelete" class="hidden">
    {#each [...checkedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
  </form>

  <!-- Select toolbar -->
  <div class="flex items-center gap-3 mb-[.6rem] min-h-8">
    <label class="flex items-center gap-[.4rem] text-[.8rem] text-muted-foreground cursor-pointer select-none">
      <input type="checkbox" checked={allChecked} indeterminate={someChecked}
             class="cursor-pointer w-[15px] h-[15px] accent-primary shrink-0"
             onchange={(e) => toggleAll((e.target as HTMLInputElement).checked)} />
      Select all
    </label>
    <div class="flex items-center gap-2 bg-card border border-border rounded-md py-[.3rem] px-3 text-[.8rem]
                transition-all duration-[180ms]
                {bulkVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}">
      <span class="font-semibold mr-1">{checkedIds.size} selected</span>
      <button type="button" onclick={handleBulkPaid} class="bg-green-50 text-green-700 border-none rounded py-[.28rem] px-[.7rem] text-[.78rem] font-semibold cursor-pointer hover:bg-green-100">✓ Mark paid</button>
      <button type="button" onclick={handleBulkDelete} class="bg-red-50 text-destructive border-none rounded py-[.28rem] px-[.7rem] text-[.78rem] font-semibold cursor-pointer hover:bg-red-100">✕ Delete</button>
    </div>
  </div>

  {#each invoices as inv (inv.id)}
    {@const noteVal = getNoteText(inv.id, inv.notes)}
    <Card.Root class="mb-[.6rem] overflow-hidden">
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="grid grid-cols-[minmax(0,1fr)_95px_95px_120px_72px_auto] items-center px-[1.1rem] py-[.9rem] gap-2 cursor-pointer select-none hover:bg-[#faf8fc]
                  max-md:grid-cols-[minmax(0,1fr)_auto] max-md:grid-rows-2 max-md:row-gap-2"
           onclick={() => toggleDrawer(inv.id)}>
        <div class="flex items-start gap-2">
          <input type="checkbox" class="cursor-pointer w-[15px] h-[15px] accent-primary shrink-0 mt-[.2rem]"
                 checked={checkedIds.has(inv.id)}
                 onclick={(e) => e.stopPropagation()}
                 onkeydown={(e) => e.stopPropagation()}
                 onchange={(e) => toggleCheck(inv.id, (e.target as HTMLInputElement).checked)} />
          <div>
            <p class="font-semibold text-[.875rem]">{inv.supplier_name ?? '—'}</p>
            <p class="text-[.78rem] text-muted-foreground">{inv.invoice_number ?? 'No invoice #'} · {inv.source_file ?? ''}</p>
          </div>
        </div>
        <p class="text-[.78rem] text-muted-foreground max-md:hidden">{inv.invoice_date ?? '—'}</p>
        <p class="text-[.78rem] text-muted-foreground max-md:hidden">Due: {inv.due_date ?? '—'}</p>
        <div class="text-right max-md:col-start-2 max-md:row-start-1">
          <span class="font-bold text-[.875rem]">{fmt(inv.total_amount)}</span>
          <span class="text-[.78rem] text-muted-foreground"> EUR</span>
        </div>
        <div class="max-md:hidden"><Badge class={badgeClass[inv.status ?? 'pending'] ?? ''}>{inv.status ?? 'pending'}</Badge></div>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="flex gap-[.35rem] justify-end items-center max-md:col-span-2 max-md:row-start-2 max-md:border-t max-md:border-secondary max-md:pt-[.4rem]"
             onclick={(e) => e.stopPropagation()}>
          {#if inv.status === 'pending'}
            <form method="post" action="?/markPaid">
              <input type="hidden" name="id" value={inv.id} />
              <button type="submit" class="text-[.75rem] font-semibold py-[.3rem] px-[.65rem] rounded-md bg-green-50 text-green-700 border-none cursor-pointer min-w-[90px] text-center hover:bg-green-100 max-md:min-w-0">✓ Mark paid</button>
            </form>
          {:else}
            <form method="post" action="?/markUnpaid">
              <input type="hidden" name="id" value={inv.id} />
              <button type="submit" class="text-[.75rem] font-semibold py-[.3rem] px-[.65rem] rounded-md bg-secondary text-muted-foreground border-none cursor-pointer min-w-[90px] text-center hover:bg-border max-md:min-w-0">↺ Revert</button>
            </form>
          {/if}
          <div class="flex flex-col gap-[.2rem]">
            <a href="/invoice/{inv.id}/edit" class="w-[26px] h-[26px] rounded-md border border-border bg-card flex items-center justify-center no-underline text-muted-foreground text-[.875rem] hover:bg-secondary" title="Edit">✎</a>
            <form method="post" action="?/deleteInvoice" onsubmit={(e) => { if (!confirm('Delete this invoice? This cannot be undone.')) e.preventDefault(); }}>
              <input type="hidden" name="id" value={inv.id} />
              <button type="submit" class="w-[26px] h-[26px] rounded-md border border-red-200 bg-card flex items-center justify-center text-destructive text-[.875rem] cursor-pointer hover:bg-red-50" title="Delete">✕</button>
            </form>
          </div>
        </div>
      </div>

      {#if openIds.has(inv.id)}
        <div class="border-t border-secondary px-[1.1rem] py-[.85rem]">
          {#if inv.source_file}
            <div class="pb-[.6rem] pt-[.4rem]">
              <a href="/invoice/{inv.id}/file" target="_blank" rel="noopener noreferrer"
                 class="text-[.78rem] border border-border rounded-md py-[.28rem] px-[.7rem] text-secondary-foreground no-underline bg-card hover:bg-secondary">See original</a>
            </div>
          {/if}

          {#if inv.line_items.length > 0}
            <table class="w-full border-collapse text-[.78rem]">
              <thead>
                <tr>
                  {#each ['Description','Qty','Unit','Unit Price','Total'] as h}
                    <th class="text-left py-[.35rem] px-2 text-muted-foreground font-bold text-[.68rem] uppercase tracking-[.04em] border-b border-border">{h}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each inv.line_items as item}
                  <tr>
                    <td class="py-[.35rem] px-2 border-b border-secondary text-secondary-foreground last:border-0">{item.description ?? '—'}</td>
                    <td class="py-[.35rem] px-2 border-b border-secondary text-secondary-foreground">{item.quantity ?? '—'}</td>
                    <td class="py-[.35rem] px-2 border-b border-secondary text-secondary-foreground">{item.unit ?? '—'}</td>
                    <td class="py-[.35rem] px-2 border-b border-secondary text-secondary-foreground">{item.unit_price ?? '—'}</td>
                    <td class="py-[.35rem] px-2 border-b border-secondary text-secondary-foreground">{item.total_price ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p class="text-muted-foreground text-[.78rem]">No line items recorded.</p>
          {/if}

          <div class="mt-[.85rem] pt-[.75rem] border-t border-secondary">
            <p class="text-[.68rem] font-bold tracking-[.05em] uppercase text-muted-foreground mb-[.3rem]">Notes</p>
            <Textarea
              maxlength={250}
              placeholder="Add a note…"
              value={noteVal}
              class="resize-y min-h-14 max-h-[120px] text-[.8rem] bg-secondary"
              oninput={(e: Event) => setNoteText(inv.id, (e.target as HTMLTextAreaElement).value)}
              onblur={() => saveNote(inv.id)}
            />
            <div class="flex justify-between items-center mt-1">
              <span class="text-[.68rem] text-green-700 transition-opacity duration-300 {noteSavedFlash[inv.id] ? 'opacity-100' : 'opacity-0'}">Saved</span>
              <span class="text-[.68rem] text-muted-foreground">{noteVal.length}/250</span>
            </div>
          </div>
        </div>
      {/if}
    </Card.Root>
  {/each}
{/if}
