<script lang="ts">
  import { untrack } from 'svelte';
  import type { PageData } from './$types';
  import { initRows, addRow, removeRow, updateRow, calcTotal } from '$lib/invoice-items';
  import type { Row } from '$lib/invoice-items';

  let { data }: { data: PageData } = $props();

  const { invoice } = $derived(data);

  let items = $state<Row[]>(untrack(() => initRows(data.lineItems)));

  const rowsWithTotals = $derived(
    items.map(row => ({ ...row, total_price: calcTotal(row.quantity, row.unit_price) }))
  );

  const inputCls = 'h-8 rounded-[6px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8] w-full';
  const readonlyCls = inputCls + ' bg-[#F9FAFB] cursor-default';
</script>

<div class="max-w-[700px] mx-auto">
  <form method="post" action="?/save" class="flex flex-col gap-4">

    <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-5 py-5">
      <p class="text-[11px] font-bold uppercase tracking-[0.05em] text-[#888888] mb-4">Invoice details</p>
      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-[11px] font-semibold text-[#888888]" for="edit-supplier">Supplier</label>
          <input id="edit-supplier" type="text" name="supplier_name" value={invoice.supplier_name ?? ''} class={inputCls} />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] font-semibold text-[#888888]" for="edit-inv-num">Invoice number</label>
          <input id="edit-inv-num" type="text" name="invoice_number" value={invoice.invoice_number ?? ''} class={inputCls} />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] font-semibold text-[#888888]" for="edit-inv-date">Invoice date</label>
          <input id="edit-inv-date" type="date" name="invoice_date" value={invoice.invoice_date ?? ''} class={inputCls} />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] font-semibold text-[#888888]" for="edit-due-date">Due date</label>
          <input id="edit-due-date" type="date" name="due_date" value={invoice.due_date ?? ''} class={inputCls} />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] font-semibold text-[#888888]" for="edit-total">Total amount</label>
          <input id="edit-total" type="text" name="total_amount" value={String(invoice.total_amount ?? '')} class={inputCls} />
        </div>
        <div class="col-span-2 flex flex-col gap-1">
          <label class="text-[11px] font-semibold text-[#888888]" for="edit-notes">
            Notes <span class="font-normal text-[#AAAAAA]">(optional · max 250 chars)</span>
          </label>
          <textarea id="edit-notes" name="notes" maxlength={250} rows={2}
                    class="resize-y rounded-[6px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]"
                    value={invoice.notes ?? ''}></textarea>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-5 py-5">
      <p class="text-[11px] font-bold uppercase tracking-[0.05em] text-[#888888] mb-4">Line items</p>
      <div class="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end mb-2">
        {#each ['Description','Qty','Unit','Unit price','Total',''] as h}
          <span class="text-[11px] font-semibold text-[#888888]">{h}</span>
        {/each}
      </div>
      {#each rowsWithTotals as row, idx (idx)}
        <div class="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center mb-2">
          <input type="text" name="line_descriptions" value={row.description ?? ''}
            oninput={(e) => { items = updateRow(items, idx, { description: (e.target as HTMLInputElement).value }); }}
            class={inputCls} />
          <input type="text" name="line_quantities" value={row.quantity ?? ''}
            oninput={(e) => { items = updateRow(items, idx, { quantity: (e.target as HTMLInputElement).value }); }}
            class={inputCls} />
          <input type="text" name="line_units" value={row.unit ?? ''}
            oninput={(e) => { items = updateRow(items, idx, { unit: (e.target as HTMLInputElement).value }); }}
            class={inputCls} />
          <input type="text" name="line_unit_prices" value={row.unit_price ?? ''}
            oninput={(e) => { items = updateRow(items, idx, { unit_price: (e.target as HTMLInputElement).value }); }}
            class={inputCls} />
          <input type="text" value={row.total_price != null ? String(row.total_price) : ''} readonly tabindex="-1" class={readonlyCls} />
          <input type="hidden" name="line_total_prices" value={row.total_price != null ? String(row.total_price) : ''} />
          <button type="button" class="bg-transparent border-none cursor-pointer text-[#E05555] text-[18px] px-1 pb-1 leading-none" onclick={() => { items = removeRow(items, idx); }}>×</button>
        </div>
      {/each}
      <button type="button" onclick={() => { items = addRow(items); }}
              class="text-[13px] font-medium text-[#888888] bg-transparent border border-dashed border-[#E5E7EB] rounded-[6px] py-[5px] px-3 cursor-pointer mt-1 hover:bg-[#F9FAFB] transition-colors">
        + Add line
      </button>
    </div>

    <div class="flex gap-3">
      <button type="submit"
              class="h-9 bg-[#4A9FD8] text-white rounded-[8px] px-4 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
        Save changes
      </button>
      <a href="/invoices"
         class="h-9 flex items-center border border-[#E5E7EB] rounded-[8px] px-4 text-[13px] text-[#1A1A1A] bg-white no-underline hover:bg-[#F9FAFB] transition-colors">
        Cancel
      </a>
    </div>

  </form>
</div>
