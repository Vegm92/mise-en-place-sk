<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { initRows, addRow, removeRow, updateRow, calcTotal } from '$lib/invoice-items';
  import type { Row } from '$lib/invoice-items';
  import { t } from '$lib/i18n';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const { invoice } = $derived(data);

  let items = $state<Row[]>(untrack(() => initRows(data.lineItems)));

  const idempotencyKey = $derived.by(() => { void invoice.id; return crypto.randomUUID(); });

  const rowsWithTotals = $derived(
    items.map(row => ({ ...row, total_price: calcTotal(row.quantity, row.unit_price) }))
  );

  const computedLineTotal = $derived(
    Math.round(rowsWithTotals.reduce((s, r) => s + (r.total_price ?? 0), 0) * 100) / 100
  );
  const totalAmountDisplay = $derived(
    invoice.total_amount != null ? invoice.total_amount : (computedLineTotal || null)
  );

  const NET_30_DAYS = 30;
  function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const suggestedDueDate = $derived(
    invoice.due_date == null && invoice.invoice_date
      ? addDays(invoice.invoice_date, NET_30_DAYS)
      : null
  );
  const dueDateDisplay = $derived(invoice.due_date ?? suggestedDueDate ?? '');
</script>

<div class="p-6 flex justify-center">
<div class="w-full max-w-[700px]">
  <form method="post" action="?/save" class="flex flex-col gap-4">
    <input type="hidden" name="version" value={invoice.version} />
    <input type="hidden" name="idempotency_key" value={idempotencyKey} />

    {#if form?.errorKey}
      <div class="card p-3 text-neg" role="alert" style="font-size:13px;">{$t(form.errorKey)}</div>
    {:else if form?.error}
      <div class="card p-3 text-neg" role="alert" style="font-size:13px;">{form.error}</div>
    {/if}

    <div class="card p-5">
      <p class="label mb-4">{$t('edit.details').toUpperCase()}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="flex flex-col gap-1">
          <label class="label" for="edit-supplier">{$t('field.supplier')}</label>
          <input id="edit-supplier" type="text" name="supplier_name" value={invoice.supplier_name ?? ''}
            class="input" style="height:36px;font-size:13px;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="label" for="edit-inv-num">{$t('field.invoiceNum')}</label>
          <input id="edit-inv-num" type="text" name="invoice_number" value={invoice.invoice_number ?? ''}
            class="input" style="height:36px;font-size:13px;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="label" for="edit-inv-date">{$t('field.invoiceDate')}</label>
          <input id="edit-inv-date" type="date" name="invoice_date" value={invoice.invoice_date ?? ''}
            class="input" style="height:36px;font-size:13px;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="label" for="edit-due-date">{$t('field.dueDate')}</label>
          <input id="edit-due-date" type="date" name="due_date" value={dueDateDisplay}
            class="input" style="height:36px;font-size:13px;" />
          {#if suggestedDueDate}
            <span class="text-fg-3" style="font-size:11px;">{$t('field.dueDateSuggested')}</span>
          {/if}
        </div>
        <div class="flex flex-col gap-1">
          <label class="label" for="edit-total">{$t('field.totalAmount')}</label>
          <input id="edit-total" type="text" name="total_amount" value={totalAmountDisplay != null ? totalAmountDisplay.toFixed(2) : ''}
            class="input" style="height:36px;font-size:13px;" />
        </div>
        <div class="col-span-1 md:col-span-2 flex flex-col gap-1">
          <label class="label" for="edit-notes">
            {$t('edit.notes')} <span class="text-fg-3 font-normal">({$t('edit.notesHint')})</span>
          </label>
          <textarea id="edit-notes" name="notes" maxlength={250} rows={2}
            class="input resize-y" style="padding:8px 10px;font-size:13px;"
            value={invoice.notes ?? ''}></textarea>
        </div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="card-header">
        <span class="body-strong" style="font-size:14px;">{$t('edit.lineItems')}</span>
      </div>
      <div class="p-5">
        <div class="grid gap-2 mb-2 items-end" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr auto;">
          {#each [$t('tbl.desc'), $t('tbl.qty'), $t('tbl.unit'), $t('tbl.unitPrice'), $t('tbl.total'), ''] as h}
            <span class="label" style="font-size:10.5px;">{h}</span>
          {/each}
        </div>
        {#each rowsWithTotals as row, idx (idx)}
          <div class="grid gap-2 items-center mb-2" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr auto;">
            <input type="text" name="line_descriptions" value={row.description ?? ''}
              oninput={(e) => { items = updateRow(items, idx, { description: (e.target as HTMLInputElement).value }); }}
              class="input" style="height:32px;font-size:12.5px;" />
            <input type="text" name="line_quantities" value={row.quantity ?? ''}
              oninput={(e) => { items = updateRow(items, idx, { quantity: (e.target as HTMLInputElement).value }); }}
              class="input" style="height:32px;font-size:12.5px;" />
            <input type="text" name="line_units" value={row.unit ?? ''}
              oninput={(e) => { items = updateRow(items, idx, { unit: (e.target as HTMLInputElement).value }); }}
              class="input" style="height:32px;font-size:12.5px;" />
            <input type="text" name="line_unit_prices" value={row.unit_price ?? ''}
              oninput={(e) => { items = updateRow(items, idx, { unit_price: (e.target as HTMLInputElement).value }); }}
              class="input" style="height:32px;font-size:12.5px;" />
            <input type="text" value={row.total_price != null ? row.total_price.toFixed(2) : ''} readonly tabindex="-1"
              class="input bg-surface-2 cursor-default" style="height:32px;font-size:12.5px;" />
            <input type="hidden" name="line_total_prices" value={row.total_price != null ? row.total_price.toFixed(2) : ''} />
            <button type="button" class="bg-transparent border-none cursor-pointer text-neg text-[18px] px-1 pb-1 leading-none"
              onclick={() => { items = removeRow(items, idx); }}>×</button>
          </div>
        {/each}
        <button type="button" onclick={() => { items = addRow(items); }}
          class="btn btn-ghost text-fg-2 mt-1" style="height:30px;border-style:dashed;font-size:13px;">
          {$t('edit.addLine')}
        </button>
      </div>
    </div>

    <div class="flex gap-3">
      <button type="submit" class="btn btn-primary" style="height:36px;">{$t('edit.save')}</button>
      <a href="/invoices" class="btn btn-secondary" style="height:36px;text-decoration:none;">{$t('edit.cancel')}</a>
    </div>

  </form>
</div>
</div>
