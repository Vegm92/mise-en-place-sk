<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<div class="flex gap-2 mb-5 flex-wrap">
  {#each [['month','This Month'],['quarter','Quarter'],['half','6 Months'],['all','All Time']] as [val, label]}
    <a href="?period={val}"
       class="text-[12px] font-semibold py-[5px] px-3 rounded-full border no-underline transition-colors
              {data.period === val
                ? 'bg-[#4A9FD8] text-white border-[#4A9FD8]'
                : 'border-[#E5E7EB] text-[#888888] hover:bg-white hover:text-[#1A1A1A]'}">
      {label}
    </a>
  {/each}
</div>

<div class="grid grid-cols-4 gap-3 mb-5 max-md:grid-cols-2">
  {#each [
    { label: 'Total spend', value: `€${Math.round(data.kpis.total_items_spend ?? 0).toLocaleString()}` },
    { label: 'Line items', value: data.kpis.total_line_items },
    { label: 'Unique items', value: data.kpis.unique_items },
    { label: 'Avg items/invoice', value: data.kpis.avg_invoice_items != null ? data.kpis.avg_invoice_items.toFixed(1) : '—' },
  ] as k}
    <div class="bg-white rounded-[8px] border border-[#E5E7EB] py-3 px-4">
      <p class="text-[11px] font-bold tracking-[0.07em] uppercase text-[#888888] mb-1">{k.label}</p>
      <p class="text-[20px] font-bold text-[#1A1A1A]">{k.value}</p>
    </div>
  {/each}
</div>

<div class="grid grid-cols-[3fr_2fr] gap-3 items-start max-md:grid-cols-1">
  <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
    <div class="px-4 py-3 border-b border-[#F3F4F6]">
      <p class="text-[11px] font-bold tracking-[0.06em] uppercase text-[#888888]">Top Items by Spend</p>
    </div>
    <div class="px-4 py-4">
      {#if !data.top_items.length}
        <p class="text-[#888888] text-[13px]">No line item data for this period.</p>
      {:else}
        {#each data.top_items as item (item.description)}
          <div class="flex items-center gap-3 mb-3">
            <span class="w-40 text-[13px] text-[#1A1A1A] shrink-0 whitespace-nowrap overflow-hidden text-ellipsis" title={item.description}>{item.description}</span>
            <div class="flex-1 bg-[#F3F4F6] rounded-sm h-[6px]">
              <div class="h-full rounded-sm bg-[#4A9FD8]" style="width:{item.pct}%"></div>
            </div>
            <span class="w-[70px] text-right text-[13px] font-semibold text-[#1A1A1A] shrink-0">€{Math.round(item.total_spend)}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
    <div class="px-4 py-3 border-b border-[#F3F4F6]">
      <p class="text-[11px] font-bold tracking-[0.06em] uppercase text-[#888888]">By Category</p>
    </div>
    <div class="px-4 py-4">
      {#if !data.category_spend.length}
        <p class="text-[#888888] text-[13px]">No data.</p>
      {:else}
        {#each data.category_spend as cat (cat.category)}
          <div class="flex items-center gap-3 mb-3">
            <span class="w-40 text-[13px] font-semibold shrink-0 whitespace-nowrap overflow-hidden text-ellipsis" style="color:{cat.color}" title={cat.category}>{cat.category}</span>
            <div class="flex-1 bg-[#F3F4F6] rounded-sm h-[6px]">
              <div class="h-full rounded-sm" style="width:{cat.pct}%;background:{cat.color}"></div>
            </div>
            <span class="w-[70px] text-right text-[13px] font-semibold text-[#1A1A1A] shrink-0">€{Math.round(cat.total)}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>
