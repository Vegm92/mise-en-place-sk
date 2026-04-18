<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<div class="max-w-[560px] mx-auto">
  <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
    <div class="px-5 py-3 border-b border-[#F3F4F6]">
      <p class="text-[11px] font-bold tracking-[0.06em] uppercase text-[#888888]">Monthly Category Budgets</p>
    </div>
    <div class="px-5 py-4">
      <form method="post" action="?/save">
        {#each data.categories as category}
          <div class="flex items-center gap-4 py-3 border-b border-[#F3F4F6] last:border-0">
            <span class="flex-1 text-[13px] font-medium text-[#1A1A1A]">{category}</span>
            <div class="flex items-center gap-2">
              <span class="text-[13px] text-[#888888] shrink-0">€</span>
              <input type="number" step="0.01" min="0" placeholder="No limit"
                     name={category} value={data.budgets[category] ?? ''}
                     class="w-[130px] h-9 rounded-[6px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]" />
            </div>
          </div>
        {/each}
        <div class="mt-4">
          <button type="submit"
                  class="h-9 bg-[#4A9FD8] text-white rounded-[8px] px-4 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
            Save budgets
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
