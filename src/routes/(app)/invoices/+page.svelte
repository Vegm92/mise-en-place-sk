<script lang="ts">
  import type { PageData } from './$types';
  import { fmt } from '$lib/formatters';
  import { t } from '$lib/i18n';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import { ChevronDown, FileDown, Trash2, Check, RotateCcw, ExternalLink, ChevronRight } from 'lucide-svelte';

  const { data }: { data: PageData } = $props();
  const { invoices, stats, suppliers, filters } = $derived(data);
  const hasFilters = $derived(!!(filters.status || filters.supplier_id || filters.date_from || filters.date_to));

  // Selection
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

  // Row expansion
  let openIds = $state<Set<number>>(new Set());
  function toggleDrawer(id: number) {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    openIds = next;
  }

  // Notes
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

  // Bulk actions
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

  function badgeClass(s: string) {
    if (s === 'overdue')   return 'badge badge-overdue';
    if (s === 'pending')   return 'badge badge-pending';
    if (s === 'exported')  return 'badge badge-exported';
    if (s === 'paid')      return 'badge badge-confirmed';
    return 'badge badge-pending';
  }
  function statusKey(s: string) {
    const map: Record<string, string> = {
      pending: 'status.pending', confirmed: 'status.confirmed',
      exported: 'status.exported', overdue: 'status.overdue', paid: 'status.paid',
    };
    return map[s] ?? s;
  }
</script>

<div class="flex flex-col gap-4 p-6">

  <!-- ── KPI Strip ───────────────────────────────────────────────── -->
  <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
    <KpiCard
      label={$t('inv.kpi.pending')}
      value={Math.round(stats.pending_amount) + ' €'}
      sub="{stats.pending_count} {stats.pending_count === 1 ? $t('misc.invoice') : $t('misc.invoices')}"
      variant={stats.pending_count > 0 ? 'warn' : 'default'}
    />
    <KpiCard
      label={$t('inv.kpi.overdue')}
      value={stats.overdue_count}
      sub={$t('dash.kpi.overdue.sub')}
      variant={stats.overdue_count > 0 ? 'neg' : 'default'}
    />
    <KpiCard
      label={$t('inv.kpi.paid')}
      value={stats.paid_count}
      sub={$t('misc.invoices')}
      variant="pos"
    />
    <KpiCard
      label={$t('inv.kpi.suppliers')}
      value={stats.supplier_count}
      sub={$t('dash.kpi.active')}
    />
  </div>

  <!-- ── Filter bar + table ──────────────────────────────────────── -->
  <SectionCard title={$t('inv.title')} noPad>
    {#snippet headerRight()}
      <a href="/invoices/export" class="btn btn-ghost" style="height:30px;font-size:12px;gap:5px;text-decoration:none;flex-shrink:0;">
        <FileDown size={13} />
        {$t('inv.export')}
      </a>
    {/snippet}

    <!-- Filter bar -->
    <form method="get" action="/invoices"
      class="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-divider max-[700px]:flex-col max-[700px]:items-stretch">

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
          <option value="overdue"  selected={filters.status === 'overdue'}>{$t('status.overdue')}</option>
        </select>
      </div>

      <div class="flex flex-col gap-1">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-from">{$t('inv.filter.from')}</label>
        <input id="inv-from" type="date" name="date_from" value={filters.date_from}
          class="input" style="height:32px;font-size:12.5px;padding:0 8px;" />
      </div>

      <div class="flex flex-col gap-1">
        <label class="label text-fg-3" style="font-size:10.5px;" for="inv-to">{$t('inv.filter.to')}</label>
        <input id="inv-to" type="date" name="date_to" value={filters.date_to}
          class="input" style="height:32px;font-size:12.5px;padding:0 8px;" />
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
      <!-- Hidden bulk forms -->
      <form id="bulk-paid-form" method="post" action="?/bulkPaid" class="hidden">
        {#each [...checkedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
      </form>
      <form id="bulk-delete-form" method="post" action="?/bulkDelete" class="hidden">
        {#each [...checkedIds] as id}<input type="hidden" name="invoice_ids" value={id} />{/each}
      </form>

      <!-- Bulk action bar -->
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

      <!-- Invoice rows -->
      {#each invoices as inv (inv.id)}
        {@const noteVal = getNoteText(inv.id, inv.notes)}
        {@const expanded = openIds.has(inv.id)}

        <div class="border-b border-divider last:border-0">
          <!-- Main row -->
          <div role="button" tabindex="0"
            class="grid items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-hover transition-colors
                   max-[800px]:grid-cols-[auto_minmax(0,1fr)_auto]"
            style="grid-template-columns:auto minmax(0,1fr) 95px 100px 110px 32px;"
            onclick={() => toggleDrawer(inv.id)}
            onkeydown={(e) => e.key === 'Enter' && toggleDrawer(inv.id)}>

            <!-- Checkbox -->
            <input type="checkbox"
              class="cursor-pointer accent-acc shrink-0"
              checked={checkedIds.has(inv.id)}
              onclick={(e) => e.stopPropagation()}
              onkeydown={(e) => e.stopPropagation()}
              onchange={(e) => toggleCheck(inv.id, (e.target as HTMLInputElement).checked)} />

            <!-- Supplier + invoice no -->
            <div class="min-w-0">
              <div class="body-strong overflow-hidden text-ellipsis whitespace-nowrap">{inv.supplier_name ?? '—'}</div>
              <div class="body text-fg-3 overflow-hidden text-ellipsis whitespace-nowrap" style="font-size:11.5px;">
                {inv.invoice_number ?? '—'} · {inv.invoice_date ?? '—'}
              </div>
            </div>

            <!-- Due date -->
            <div class="body text-fg-3 max-[800px]:hidden" style="font-size:12px;">
              {inv.due_date ?? '—'}
            </div>

            <!-- Amount -->
            <div class="num text-right font-semibold" style="font-size:13px;">
              {fmt(inv.total_amount)} <span class="text-fg-3" style="font-weight:400;font-size:11px;">EUR</span>
            </div>

            <!-- Status badge -->
            <div class="max-[800px]:hidden">
              <span class={badgeClass(inv.status ?? 'pending')}>{$t(statusKey(inv.status ?? 'pending'))}</span>
            </div>

            <!-- Expand chevron -->
            <div class="flex justify-end text-fg-3 transition-transform {expanded ? 'rotate-90' : ''}">
              <ChevronRight size={15} />
            </div>
          </div>

          <!-- Expanded drawer -->
          {#if expanded}
            <div class="bg-surface-2 border-t border-divider px-4 py-4 flex flex-col gap-4"
              role="presentation" onclick={(e) => e.stopPropagation()}>

              <!-- Actions row -->
              <div class="flex items-center gap-2 flex-wrap">
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
                <form method="post" action="?/deleteInvoice"
                  onsubmit={(e) => { if (!confirm($t('inv.confirm.del1'))) e.preventDefault(); }}>
                  <input type="hidden" name="id" value={inv.id} />
                  <button type="submit" class="btn btn-ghost text-neg" style="height:28px;font-size:12px;gap:5px;">
                    <Trash2 size={12} />
                    {$t('inv.delete')}
                  </button>
                </form>
              </div>

              <!-- Line items -->
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
                        <td class="num">{item.unit_price ?? '—'}</td>
                        <td class="num font-semibold">{item.total_price ?? '—'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <p class="body">{$t('inv.detail.noLines')}</p>
              {/if}

              <!-- Notes -->
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
    {/if}
  </SectionCard>

</div>
