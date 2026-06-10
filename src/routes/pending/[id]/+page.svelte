<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';

  const { data }: { data: PageData } = $props();

  const isProcessing = !data.pending.rawLlmJson && data.pending.status === 'PENDING_REVIEW';
  let pollInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    if (!isProcessing) return;
    pollInterval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/inference-status/${data.pending.id}`);
        if (!resp.ok) return;
        const json = await resp.json();
        if (json.status !== 'PENDING_REVIEW' || json.isReady) {
          clearInterval(pollInterval);
          pollInterval = undefined;
          location.replace(`/pending/${data.pending.id}`);
        }
      } catch {
        // keep polling
      }
    }, 2000);
  });

  onDestroy(() => {
    if (pollInterval !== undefined) clearInterval(pollInterval);
  });

  type LineItemRow = {
    id: string;
    rawDescription: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    totalPrice: string;
    fuzzyScore: number;
    suggestedName: string | null;
    priceWarning: boolean;
  };

  let supplierName = $state<string>(data.pending.inferredSupplierName ?? '');
  let invoiceNumber = $state<string>(data.pending.invoiceNumber ?? '');
  let invoiceDate = $state<string>(data.pending.invoiceDate ?? '');
  let totalAmount = $state<string>(String(data.pending.totalAmount ?? ''));

  let rows = $state<LineItemRow[]>(
    data.lineItems.map((li: {
      id: number | string;
      rawDescription: string | null;
      suggestedName: string | null;
      quantity: number | string | null;
      unit: string | null;
      unitPrice: number | string | null;
      fuzzyScore: number | null;
      priceWarning: number | boolean | null;
    }) => ({
      id: String(li.id),
      rawDescription: li.rawDescription ?? '',
      description: li.suggestedName ?? li.rawDescription ?? '',
      quantity: String(li.quantity ?? ''),
      unit: li.unit ?? '',
      unitPrice: String(li.unitPrice ?? ''),
      totalPrice: computeTotal(li.quantity, li.unitPrice),
      fuzzyScore: li.fuzzyScore ?? 0,
      suggestedName: li.suggestedName,
      priceWarning: !!li.priceWarning,
    }))
  );

  function computeTotal(qty: number | string | null, price: number | string | null): string {
    const q = parseFloat(String(qty ?? ''));
    const p = parseFloat(String(price ?? ''));
    if (isNaN(q) || isNaN(p)) return '';
    return (q * p).toFixed(2);
  }

  function recomputeRow(idx: number) {
    const row = rows[idx];
    row.totalPrice = computeTotal(row.quantity, row.unitPrice);
    rows = [...rows];
  }

  const inputCls = 'w-full py-1 px-2 border border-[#E5E7EB] rounded-[4px] text-[13px] font-[inherit] bg-white text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]';
</script>

{#if isProcessing}
  <div class="fixed inset-0 bg-black/60 z-[100] flex flex-col items-center justify-center gap-3">
    <div class="w-10 h-10 border-[3px] border-white/20 border-t-[#4A9FD8] rounded-full animate-spin"></div>
    <p class="text-[15px] font-semibold text-white">{$t('pending.processing')}</p>
    <p class="text-[13px] text-white/60">{$t('pending.processingDesc')}</p>
  </div>
{/if}

<div class="max-w-[700px] mx-auto">
  <h1 class="text-[18px] font-bold text-[#1A1A1A] mb-5">{$t('pending.title')}</h1>

  {#if data.isManualReview}
    <div class="bg-[#FFF8EE] border border-[#F5D08A] text-[#C8843A] rounded-[8px] px-4 py-3 text-[13px] font-medium mb-4">
      {$t('pending.manualReview')}
    </div>
  {/if}

  {#if data.pending.isDuplicate}
    <div class="bg-[#FFF1F0] border border-[#FECACA] text-[#E05555] rounded-[8px] px-4 py-3 text-[13px] font-medium mb-4">
      {$t('pending.duplicate')}
    </div>
  {/if}

  <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-5 py-5 mb-4">
    <p class="text-[11px] font-bold uppercase tracking-[0.05em] text-[#888888] mb-4">{$t('pending.sectionData')}</p>
    <div class="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
      <div class="col-span-2 max-[640px]:col-span-1 flex flex-col gap-1">
        <label class="text-[11px] font-semibold text-[#888888]" for="supplierName">{$t('field.supplier')}</label>
        <input id="supplierName" type="text" form="commit-form" name="supplierName"
               bind:value={supplierName} class={inputCls} />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[11px] font-semibold text-[#888888]" for="invoiceNumber">{$t('field.invoiceNum')}</label>
        <input id="invoiceNumber" type="text" form="commit-form" name="invoiceNumber"
               bind:value={invoiceNumber} class={inputCls} />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[11px] font-semibold text-[#888888]" for="invoiceDate">{$t('field.invoiceDate')}</label>
        <input id="invoiceDate" type="text" form="commit-form" name="invoiceDate"
               bind:value={invoiceDate} placeholder="YYYY-MM-DD" class={inputCls} />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[11px] font-semibold text-[#888888]" for="totalAmount">{$t('field.totalAmount')}</label>
        <input id="totalAmount" type="text" form="commit-form" name="totalAmount"
               bind:value={totalAmount} class={inputCls} />
      </div>
    </div>
  </div>

  <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-5 py-5 mb-4">
    <p class="text-[11px] font-bold uppercase tracking-[0.05em] text-[#888888] mb-4">{$t('pending.sectionLines')}</p>
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {#each [$t('pending.colOrigDesc'), $t('pending.colDesc'), $t('tbl.qty'), $t('tbl.unit'), $t('tbl.unitPrice'), $t('tbl.total')] as h}
              <th class="text-left py-2 px-2 bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-[0.04em] text-[#888888] whitespace-nowrap border-b border-[#E5E7EB]">{h}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i}
            <tr>
              <td class="py-2 px-2 border-b border-[#F3F4F6] align-middle">
                <span class="text-[12px] text-[#888888] whitespace-nowrap overflow-hidden text-ellipsis max-w-[160px] block" title={row.rawDescription}>{row.rawDescription}</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  {#if row.fuzzyScore >= 0.8 && row.suggestedName}
                    <span class="text-[10px] font-bold px-[6px] py-[2px] rounded-full bg-[#DCFCE7] text-[#166534] whitespace-nowrap">Match: {row.suggestedName}</span>
                  {/if}
                  {#if row.priceWarning}
                    <span class="text-[10px] font-bold px-[6px] py-[2px] rounded-full bg-[#FFF1F0] text-[#E05555] whitespace-nowrap">{$t('pending.priceWarning')}</span>
                  {/if}
                </div>
              </td>
              <td class="py-2 px-2 border-b border-[#F3F4F6] align-middle">
                <input type="text" form="commit-form" name="line_descriptions[]" bind:value={row.description} class={inputCls} />
              </td>
              <td class="py-2 px-2 border-b border-[#F3F4F6] align-middle">
                <input type="text" form="commit-form" name="line_quantities[]" bind:value={row.quantity} oninput={() => recomputeRow(i)} class={inputCls} />
              </td>
              <td class="py-2 px-2 border-b border-[#F3F4F6] align-middle">
                <input type="text" form="commit-form" name="line_units[]" bind:value={row.unit} class={inputCls} />
              </td>
              <td class="py-2 px-2 border-b border-[#F3F4F6] align-middle">
                <input type="text" form="commit-form" name="line_unit_prices[]" bind:value={row.unitPrice} oninput={() => recomputeRow(i)} class={inputCls} />
              </td>
              <td class="py-2 px-2 border-b border-[#F3F4F6] align-middle">
                <input type="text" form="commit-form" name="line_total_prices[]" value={row.totalPrice} readonly
                       class="w-full py-1 px-2 border border-transparent rounded-[4px] text-[13px] bg-[#F9FAFB] text-[#888888] cursor-default" />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <form id="commit-form" method="POST" action="?/commit"></form>

  <div class="flex gap-3 flex-wrap">
    <button type="submit" form="commit-form"
            class="h-9 bg-[#4A9FD8] text-white rounded-[8px] px-4 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
      {$t('pending.approve')}
    </button>
    <form method="POST" action="?/reject">
      <button type="submit"
              class="h-9 border border-[#E5E7EB] bg-white text-[#1A1A1A] rounded-[8px] px-4 text-[13px] font-semibold cursor-pointer hover:bg-[#F9FAFB] transition-colors">
        {$t('pending.reject')}
      </button>
    </form>
  </div>
</div>
