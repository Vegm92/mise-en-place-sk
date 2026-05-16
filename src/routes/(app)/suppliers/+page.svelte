<script lang="ts">
  import type { PageData } from './$types';
  import { SUPPLIER_BADGE_CLS, SUPPLIER_BADGE_LABEL } from '$lib/constants';

  let { data }: { data: PageData } = $props();

  const badgeCls = SUPPLIER_BADGE_CLS;
  const badgeLabel = SUPPLIER_BADGE_LABEL;
</script>

{#if !data.suppliers.length}
  <p class="text-center py-16 text-[#888888] text-[13px]">No suppliers yet. Upload an invoice to add one.</p>
{:else}
  <div class="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
    {#each data.suppliers as s (s.id)}
      <div class="bg-white rounded-[12px] border border-[#E5E7EB] p-4 transition-[border-color,box-shadow] hover:border-[#4A9FD8] hover:shadow-md">
        <p class="text-[11px] font-bold tracking-[0.07em] uppercase mb-1" style="color:{s.color}">{s.category}</p>
        <p class="text-[15px] font-semibold text-[#1A1A1A] mb-4">{s.name}</p>
        <div class="grid grid-cols-3 gap-2 mb-4">
          <div>
            <p class="text-[11px] text-[#888888]">This month</p>
            <p class="text-[13px] font-semibold text-[#1A1A1A]">{Math.round(s.month_spend)}</p>
          </div>
          <div>
            <p class="text-[11px] text-[#888888]">Open inv.</p>
            <p class="text-[13px] font-semibold text-[#1A1A1A]">{s.open_count}</p>
          </div>
          <div>
            <p class="text-[11px] text-[#888888]">Last invoice</p>
            <p class="text-[13px] font-semibold text-[#1A1A1A]">{s.last_invoice_date ?? '—'}</p>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold px-2 py-[2px] rounded-full {badgeCls[s.badge] ?? 'bg-[#F3F4F6] text-[#666666]'}">
            {badgeLabel[s.badge] ?? s.badge}
          </span>
          <form method="post" action="?/setCategory">
            <input type="hidden" name="supplier_id" value={s.id} />
            <select name="category"
                    class="text-[12px] py-1 px-2 border border-[#E5E7EB] rounded-[6px] bg-[#F9FAFB] text-[#666666] cursor-pointer font-[inherit] focus:outline-none focus:border-[#4A9FD8]"
                    onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.submit()}>
              <option value="">— set category —</option>
              {#each data.categories as cat}
                <option value={cat} selected={s.category === cat}>{cat}</option>
              {/each}
            </select>
          </form>
        </div>
      </div>
    {/each}
  </div>
{/if}
