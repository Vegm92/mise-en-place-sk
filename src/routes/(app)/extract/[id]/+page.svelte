<script lang="ts">
  import { untrack } from 'svelte';
  import type { PageData } from './$types';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';

  const { data }: { data: PageData } = $props();

  type LineItem = { description?: string; quantity?: number | string; unit?: string; unit_price?: number | string; total_price?: number | string };

  // untrack: intentional snapshot for editable form
  let lineItems = $state<LineItem[]>(untrack(() => {
    const items = Array.isArray(data.data?.line_items) ? (data.data.line_items as LineItem[]) : [];
    return items.length > 0 ? items : [];
  }));

  function addRow() { lineItems = [...lineItems, { description: '', quantity: '', unit: '', unit_price: '', total_price: '' }]; }
  function removeRow(idx: number) { lineItems = lineItems.filter((_, i) => i !== idx); }

  const confidence = $derived(typeof data.data?.confidence === 'number' ? (data.data.confidence as number) : 0);
  const confidenceDisplay = $derived((confidence * 100).toFixed(0) + '%');
  const needsReview = (val: unknown) => !val;

  function str(val: unknown): string {
    if (val === null || val === undefined) return '';
    return String(val);
  }

  const confBadgeClass = $derived(
    data.confidenceLevel === 'high' ? 'bg-green-100 text-green-800'
    : data.confidenceLevel === 'medium' ? 'bg-yellow-100 text-yellow-800'
    : 'bg-red-100 text-red-800'
  );
</script>

<div class="max-w-[680px]">

  {#if data.totalInvoices > 1}
    <div class="flex border border-border rounded-lg overflow-hidden mb-5">
      {#each Array(data.totalInvoices) as _, i}
        {@const step = i + 1}
        <div class="flex-1 py-[.45rem] px-2 text-[.72rem] font-semibold text-center border-r border-border last:border-0
                    {step < data.invoiceIndex ? 'bg-green-50 text-green-700' : step === data.invoiceIndex ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'}">
          {step < data.invoiceIndex ? '✓' : step}
        </div>
      {/each}
    </div>
  {/if}

  <div class="flex flex-wrap gap-[.4rem] mb-5">
    {#each data.filenames as name}
      <span class="inline-flex items-center gap-[.35rem] bg-secondary border border-border rounded px-[.6rem] py-[.28rem] text-[.75rem] text-secondary-foreground">
        {name.toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'} {name}
      </span>
    {/each}
  </div>

  {#if data.error}
    <div class="bg-red-100 border border-red-200 text-red-800 rounded-lg p-4 text-[.875rem] mb-4">
      <strong>Extraction failed</strong> {data.error}
    </div>
  {/if}

  {#if !data.error}
    {#if data.confidenceLevel === 'low'}
      <div class="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-[.875rem] mb-4">
        <strong class="block mb-1">Low confidence — please review carefully</strong>
        {str(data.data?.extraction_notes) || 'Several fields may be missing or inaccurate.'}
      </div>
    {:else if data.confidenceLevel === 'medium'}
      <div class="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-[.875rem] mb-4">
        <strong class="block mb-1">Some fields may need correction</strong>
        {str(data.data?.extraction_notes)}
      </div>
    {/if}

    {#if data.conversionNotes && data.conversionNotes.length > 0}
      <div class="mb-4 flex flex-col gap-2">
        {#each data.conversionNotes as note}
          <div class="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-lg px-4 py-3 text-[.875rem]">
            ⚠️ {note}
          </div>
        {/each}
      </div>
    {/if}

    <form method="POST" action="?/save">
      <input type="hidden" name="confidence" value={str(data.data?.confidence ?? 0)} />

      <Card.Root class="p-8 mb-4">
        <h2 class="text-base font-semibold mb-5 flex items-center gap-2">
          Invoice Details
          <span class="text-[.72rem] font-semibold px-2 py-[.15rem] rounded-full {confBadgeClass}">{confidenceDisplay} confidence</span>
        </h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-[.35rem]">
            <Label class="text-[.72rem]">Supplier</Label>
            <Input type="text" name="supplier_name" value={str(data.data?.supplier_name)}
                   class={needsReview(data.data?.supplier_name) ? 'border-yellow-300 bg-yellow-50 focus-visible:ring-yellow-300' : ''} />
          </div>
          <div class="flex flex-col gap-[.35rem]">
            <Label class="text-[.72rem]">Invoice Number</Label>
            <Input type="text" name="invoice_number" value={str(data.data?.invoice_number)}
                   class={needsReview(data.data?.invoice_number) ? 'border-yellow-300 bg-yellow-50 focus-visible:ring-yellow-300' : ''} />
          </div>
          <div class="flex flex-col gap-[.35rem]">
            <Label class="text-[.72rem]">Invoice Date</Label>
            <Input type="text" name="invoice_date" value={str(data.data?.invoice_date)} placeholder="YYYY-MM-DD"
                   class={needsReview(data.data?.invoice_date) ? 'border-yellow-300 bg-yellow-50 focus-visible:ring-yellow-300' : ''} />
          </div>
          <div class="flex flex-col gap-[.35rem]">
            <Label class="text-[.72rem]">Due Date</Label>
            <Input type="text" name="due_date" value={str(data.data?.due_date)} placeholder="YYYY-MM-DD"
                   class={needsReview(data.data?.due_date) ? 'border-yellow-300 bg-yellow-50 focus-visible:ring-yellow-300' : ''} />
          </div>
          <div class="flex flex-col gap-[.35rem]">
            <Label class="text-[.72rem]">Total Amount</Label>
            <Input type="text" name="total_amount" value={str(data.data?.total_amount)}
                   class={needsReview(data.data?.total_amount) ? 'border-yellow-300 bg-yellow-50 focus-visible:ring-yellow-300' : ''} />
          </div>
          <div class="col-span-2 flex flex-col gap-[.35rem]">
            <Label class="text-[.72rem]">Notes <span class="font-normal text-muted-foreground text-[.75em]">(optional · max 250 chars)</span></Label>
            <Textarea name="notes" maxlength={250} rows={2} placeholder="Any additional context…" class="resize-y" />
          </div>
        </div>
      </Card.Root>

      <Card.Root class="p-8 mb-4">
        <h2 class="text-base font-semibold mb-4">Line Items</h2>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-[.875rem]">
            <thead>
              <tr>
                {#each ['Description','Qty','Unit','Unit Price','Total',''] as h}
                  <th class="text-left py-2 px-3 bg-secondary text-[.75rem] font-semibold uppercase tracking-[.04em] text-secondary-foreground">{h}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each lineItems as item, i}
                <tr>
                  {#each [['line_descriptions', item.description], ['line_quantities', item.quantity], ['line_units', item.unit], ['line_unit_prices', item.unit_price], ['line_total_prices', item.total_price]] as [name, val] (name as string)}
                    <td class="py-2 px-3 border-t border-border">
                      <input type="text" name={name as string} value={str(val)}
                             class="w-full py-[.35rem] px-2 border border-border rounded bg-secondary text-[.875rem] focus:outline-none focus:border-primary" />
                    </td>
                  {/each}
                  <td class="py-2 px-3 border-t border-border">
                    <button type="button" class="bg-transparent border-none cursor-pointer text-muted-foreground hover:text-destructive text-[.9rem] px-1" onclick={() => removeRow(i)}>✕</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <button type="button" onclick={addRow}
                class="mt-2 bg-transparent border border-dashed border-border rounded text-primary cursor-pointer font-[inherit] text-[.78rem] py-[.35rem] px-3 hover:bg-secondary">
          + Add row
        </button>
      </Card.Root>

      <Button type="submit">Save Invoice</Button>
    </form>
  {/if}

  <form method="POST" action="?/discard" class="mt-3">
    <Button type="submit" variant="outline">Discard</Button>
  </form>

</div>
