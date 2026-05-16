<script lang="ts">
  import { untrack } from 'svelte';
  import type { PageData } from './$types';
  import { str } from '$lib/formatters';
  import { CONFIDENCE_BADGE_CLS } from '$lib/constants';

  const { data }: { data: PageData } = $props();

  type LineItem = { description?: string; quantity?: number | string; unit?: string; unit_price?: number | string; total_price?: number | string };

  let lineItems = $state<LineItem[]>(untrack(() => {
    const items = Array.isArray(data.data?.line_items) ? (data.data.line_items as LineItem[]) : [];
    return items.length > 0 ? items : [];
  }));

  function addRow() { lineItems = [...lineItems, { description: '', quantity: '', unit: '', unit_price: '', total_price: '' }]; }
  function removeRow(idx: number) { lineItems = lineItems.filter((_, i) => i !== idx); }

  const confidence = $derived(typeof data.data?.confidence === 'number' ? (data.data.confidence as number) : 0);
  const confidenceDisplay = $derived((confidence * 100).toFixed(0) + '%');
  const needsReview = (val: unknown) => !val;

  const confBadgeCls = $derived(CONFIDENCE_BADGE_CLS[data.confidenceLevel ?? 'low'] ?? CONFIDENCE_BADGE_CLS.low);

  const inputCls = 'h-9 rounded-[6px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8] w-full';
  const warnCls  = 'h-9 rounded-[6px] border border-[#F5D08A] bg-[#FFFBEB] px-3 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#C8843A] w-full';
</script>

<div class="max-w-[680px] mx-auto">

  {#if data.totalInvoices > 1}
    <div class="flex border border-[#E5E7EB] rounded-[8px] overflow-hidden mb-5">
      {#each Array(data.totalInvoices) as _, i}
        {@const step = i + 1}
        <div class="flex-1 py-2 px-2 text-[12px] font-semibold text-center border-r border-[#E5E7EB] last:border-0
                    {step < data.invoiceIndex ? 'bg-[#F0FDF4] text-[#3A8C5C]' : step === data.invoiceIndex ? 'bg-[#4A9FD8] text-white' : 'bg-[#F9FAFB] text-[#888888]'}">
          {step < data.invoiceIndex ? '✓' : step}
        </div>
      {/each}
    </div>
  {/if}

  <div class="flex flex-wrap gap-2 mb-5">
    {#each data.filenames as name}
      <span class="inline-flex items-center gap-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[6px] px-3 py-1 text-[12px] text-[#666666]">
        {name.toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'} {name}
      </span>
    {/each}
  </div>

  {#if data.error}
    <div class="bg-[#FFF1F0] border border-[#FECACA] text-[#E05555] rounded-[8px] p-4 text-[13px] mb-4">
      <strong class="block mb-1">Extraction failed</strong>
      <p class="mb-3">{data.error}</p>
      <a href="/extract/{data.id}"
         class="inline-block bg-[#E05555] text-white rounded-[6px] px-3 py-1 text-[12px] font-semibold hover:bg-[#c94444] transition-colors no-underline">
        Try again
      </a>
    </div>
  {/if}

  {#if !data.error}
    {#if data.confidenceLevel === 'low'}
      <div class="bg-[#FFF1F0] border border-[#FECACA] text-[#E05555] rounded-[8px] px-4 py-3 text-[13px] mb-4">
        <strong class="block mb-1">Low confidence — please review carefully</strong>
        {str(data.data?.extraction_notes) || 'Several fields may be missing or inaccurate.'}
      </div>
    {:else if data.confidenceLevel === 'medium'}
      <div class="bg-[#FFF8EE] border border-[#F5D08A] text-[#C8843A] rounded-[8px] px-4 py-3 text-[13px] mb-4">
        <strong class="block mb-1">Some fields may need correction</strong>
        {str(data.data?.extraction_notes)}
      </div>
    {/if}

    {#if data.conversionNotes && data.conversionNotes.length > 0}
      <div class="mb-4 flex flex-col gap-2">
        {#each data.conversionNotes as note}
          <div class="bg-[#FFF8EE] border border-[#F5D08A] text-[#C8843A] rounded-[8px] px-4 py-3 text-[13px]">
            ⚠️ {note}
          </div>
        {/each}
      </div>
    {/if}

    <form method="POST" action="?/save">
      <input type="hidden" name="confidence" value={str(data.data?.confidence ?? 0)} />

      <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-5 py-5 mb-4">
        <h2 class="text-[14px] font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
          Invoice Details
          <span class="text-[10px] font-semibold px-2 py-[2px] rounded-full {confBadgeCls}">{confidenceDisplay} confidence</span>
        </h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-[#888888]" for="ext-supplier">Supplier</label>
            <input id="ext-supplier" type="text" name="supplier_name" value={str(data.data?.supplier_name)}
                   class={needsReview(data.data?.supplier_name) ? warnCls : inputCls} />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-[#888888]" for="ext-inv-num">Invoice Number</label>
            <input id="ext-inv-num" type="text" name="invoice_number" value={str(data.data?.invoice_number)}
                   class={needsReview(data.data?.invoice_number) ? warnCls : inputCls} />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-[#888888]" for="ext-inv-date">Invoice Date</label>
            <input id="ext-inv-date" type="text" name="invoice_date" value={str(data.data?.invoice_date)} placeholder="YYYY-MM-DD"
                   class={needsReview(data.data?.invoice_date) ? warnCls : inputCls} />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-[#888888]" for="ext-due-date">Due Date</label>
            <input id="ext-due-date" type="text" name="due_date" value={str(data.data?.due_date)} placeholder="YYYY-MM-DD"
                   class={needsReview(data.data?.due_date) ? warnCls : inputCls} />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-[#888888]" for="ext-total">Total Amount</label>
            <input id="ext-total" type="text" name="total_amount" value={str(data.data?.total_amount)}
                   class={needsReview(data.data?.total_amount) ? warnCls : inputCls} />
          </div>
          <div class="col-span-2 flex flex-col gap-1">
            <label class="text-[11px] font-semibold text-[#888888]" for="ext-notes">
              Notes <span class="font-normal text-[#AAAAAA]">(optional · max 250 chars)</span>
            </label>
            <textarea id="ext-notes" name="notes" maxlength={250} rows={2} placeholder="Any additional context…"
                      class="resize-y rounded-[6px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]"></textarea>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-5 py-5 mb-4">
        <h2 class="text-[14px] font-semibold text-[#1A1A1A] mb-4">Line Items</h2>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {#each ['Description','Qty','Unit','Unit Price','Total',''] as h}
                  <th class="text-left py-2 px-2 bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-[0.04em] text-[#888888] border-b border-[#E5E7EB]">{h}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each lineItems as item, i}
                <tr>
                  {#each [['line_descriptions', item.description], ['line_quantities', item.quantity], ['line_units', item.unit], ['line_unit_prices', item.unit_price], ['line_total_prices', item.total_price]] as [name, val] (name as string)}
                    <td class="py-2 px-2 border-b border-[#F3F4F6]">
                      <input type="text" name={name as string} value={str(val)}
                             class="w-full py-1 px-2 border border-[#E5E7EB] rounded-[4px] bg-[#F9FAFB] text-[13px] focus:outline-none focus:border-[#4A9FD8]" />
                    </td>
                  {/each}
                  <td class="py-2 px-2 border-b border-[#F3F4F6]">
                    <button type="button" class="bg-transparent border-none cursor-pointer text-[#888888] hover:text-[#E05555] text-[14px] px-1 transition-colors" onclick={() => removeRow(i)}>✕</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <button type="button" onclick={addRow}
                class="mt-3 bg-transparent border border-dashed border-[#E5E7EB] rounded-[6px] text-[#4A9FD8] cursor-pointer font-[inherit] text-[13px] py-[5px] px-3 hover:bg-[#EFF8FF] transition-colors">
          + Add row
        </button>
      </div>

      <button type="submit"
              class="h-9 bg-[#4A9FD8] text-white rounded-[8px] px-4 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
        Save Invoice
      </button>
    </form>
  {/if}

  <form method="POST" action="?/discard" class="mt-3">
    <button type="submit"
            class="h-9 border border-[#E5E7EB] bg-white text-[#1A1A1A] rounded-[8px] px-4 text-[13px] font-semibold cursor-pointer hover:bg-[#F9FAFB] transition-colors">
      Discard
    </button>
  </form>

</div>
