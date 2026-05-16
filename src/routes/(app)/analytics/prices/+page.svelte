<script lang="ts">
  import type { PageData } from './$types';
  import { truncate, fmt as fmtPrice } from '$lib/formatters';

  let { data }: { data: PageData } = $props();
</script>

<!-- KPI strip -->
<div class="grid grid-cols-2 gap-3 mb-5 max-md:grid-cols-1">
  <div class="bg-white rounded-[8px] border border-[#E5E7EB] py-3 px-4">
    <p class="text-[11px] font-bold tracking-[0.07em] uppercase text-[#888888] mb-1">Biggest Increase</p>
    {#if data.top_increases.length}
      {@const t = data.top_increases[0]}
      <p class="text-[16px] font-bold text-[#E05555]">↑ {t.change_pct}%</p>
      <p class="text-[12px] text-[#888888]">{truncate(t.description, 32)}</p>
      <p class="text-[12px] text-[#888888]">{t.supplier_name}</p>
    {:else}
      <p class="text-[14px] font-bold text-[#888888]">—</p>
      <p class="text-[12px] text-[#888888]">Not enough data yet</p>
    {/if}
  </div>
  <div class="bg-white rounded-[8px] border border-[#E5E7EB] py-3 px-4">
    <p class="text-[11px] font-bold tracking-[0.07em] uppercase text-[#888888] mb-1">Biggest Decrease</p>
    {#if data.top_decreases.length}
      {@const t = data.top_decreases[0]}
      <p class="text-[16px] font-bold text-[#3A8C5C]">↓ {Math.abs(t.change_pct ?? 0).toFixed(1)}%</p>
      <p class="text-[12px] text-[#888888]">{truncate(t.description, 32)}</p>
      <p class="text-[12px] text-[#888888]">{t.supplier_name}</p>
    {:else}
      <p class="text-[14px] font-bold text-[#888888]">—</p>
      <p class="text-[12px] text-[#888888]">Not enough data yet</p>
    {/if}
  </div>
</div>

<!-- Filter -->
<form method="get" action="/analytics/prices" class="flex gap-2 flex-wrap items-end mb-4">
  <div>
    <label class="block text-[11px] font-semibold text-[#888888] uppercase tracking-[0.05em] mb-1" for="supplier_id">Supplier</label>
    <select id="supplier_id" name="supplier_id"
            class="h-8 rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]">
      <option value="">All suppliers</option>
      {#each data.suppliers as s}
        <option value={s.id} selected={data.selected_supplier === s.id}>{s.name}</option>
      {/each}
    </select>
  </div>
  <button type="submit"
          class="h-8 bg-[#4A9FD8] text-white rounded-[8px] px-3 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
    Filter
  </button>
  {#if data.selected_supplier}
    <a href="/analytics/prices"
       class="h-8 flex items-center border border-[#E5E7EB] rounded-[8px] px-3 text-[13px] text-[#888888] bg-white no-underline hover:bg-[#F9FAFB] transition-colors">
      Clear
    </a>
  {/if}
</form>

<!-- Table -->
<div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
  <div class="px-4 py-3 border-b border-[#F3F4F6] flex items-center justify-between">
    <p class="text-[11px] font-bold tracking-[0.06em] uppercase text-[#888888]">Price History</p>
    <span class="text-[12px] text-[#888888]">{data.items.length} item{data.items.length !== 1 ? 's' : ''}</span>
  </div>
  <div class="overflow-x-auto">
    {#if data.items.length}
      <table class="w-full border-collapse text-[13px] min-w-[560px]">
        <thead>
          <tr>
            {#each ['Description','Supplier','Unit','Latest Price','Prev Price','Change','Last Seen'] as h}
              <th class="text-left py-2 px-3 bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-[0.04em] text-[#888888] whitespace-nowrap border-b border-[#E5E7EB]">{h}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each data.items as item}
            <tr class="hover:bg-[#FAFAFA]">
              <td class="py-2 px-3 border-b border-[#F3F4F6] font-semibold text-[#1A1A1A]">{item.description}</td>
              <td class="py-2 px-3 border-b border-[#F3F4F6] text-[#888888] text-[12px]">{item.supplier_name}</td>
              <td class="py-2 px-3 border-b border-[#F3F4F6] text-[#888888] text-[12px]">{item.unit ?? '—'}</td>
              <td class="py-2 px-3 border-b border-[#F3F4F6] font-semibold text-[#1A1A1A]">{fmtPrice(item.latest_price)} <span class="text-[11px] text-[#888888]">EUR</span></td>
              <td class="py-2 px-3 border-b border-[#F3F4F6] text-[#888888]">{item.prev_price != null ? fmtPrice(item.prev_price) : '—'}</td>
              <td class="py-2 px-3 border-b border-[#F3F4F6]">
                {#if item.change_pct != null}
                  {#if item.change_pct > 0}
                    <span class="text-[#E05555] font-bold">↑ {item.change_pct}%</span>
                  {:else if item.change_pct < 0}
                    <span class="text-[#3A8C5C] font-bold">↓ {Math.abs(item.change_pct).toFixed(1)}%</span>
                  {:else}
                    <span class="text-[#888888]">→ 0%</span>
                  {/if}
                {:else}
                  <span class="text-[#888888]">—</span>
                {/if}
              </td>
              <td class="py-2 px-3 border-b border-[#F3F4F6] text-[#888888] text-[12px] whitespace-nowrap">{item.latest_date ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="text-center py-16 text-[#888888] text-[13px]">No line item prices recorded yet. Upload some invoices to start tracking.</p>
    {/if}
  </div>
</div>
