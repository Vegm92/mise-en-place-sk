<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<div class="max-w-[560px] mx-auto">
  <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
    <div class="px-5 py-3 border-b border-[#F3F4F6] flex items-center justify-between">
      <p class="text-[11px] font-bold tracking-[0.06em] uppercase text-[#888888]">Export Invoices</p>
      <a href="/invoices" class="text-[12px] text-[#4A9FD8] no-underline hover:underline">← Invoices</a>
    </div>
    <div class="px-5 py-5">
      <form method="GET" action="/invoices/export/download">
        <div class="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">

          <div class="col-span-2 max-[600px]:col-span-1">
            <label class="block text-[11px] font-semibold text-[#888888] uppercase tracking-[0.05em] mb-1" for="date_from">Date range</label>
            <div class="flex gap-2 items-center">
              <input id="date_from" type="date" name="date_from"
                     class="flex-1 h-9 rounded-[6px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]" />
              <span class="text-[#888888] text-[13px]">→</span>
              <input type="date" name="date_to"
                     class="flex-1 h-9 rounded-[6px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]" />
            </div>
            <p class="text-[11px] text-[#888888] mt-1">Leave blank to include all dates</p>
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-[#888888] uppercase tracking-[0.05em] mb-1" for="supplier_id">Supplier</label>
            <select id="supplier_id" name="supplier_id"
                    class="w-full h-9 rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]">
              <option value="">All suppliers</option>
              {#each data.suppliers as s (s.id)}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
          </div>

          <div>
            <p class="text-[11px] font-semibold text-[#888888] uppercase tracking-[0.05em] mb-1">Status</p>
            <div class="flex gap-3 flex-wrap h-9 items-center">
              {#each [['','All'],['paid','Paid'],['pending','Pending']] as [val, lbl]}
                <label class="flex items-center gap-1 text-[13px] font-medium text-[#1A1A1A] cursor-pointer">
                  <input type="radio" name="status" value={val} checked={val === ''} class="accent-[#4A9FD8]" />
                  {lbl}
                </label>
              {/each}
            </div>
          </div>

          <div class="col-span-2 flex gap-3 items-center max-[600px]:col-span-1">
            <a href="/invoices"
               class="h-9 flex items-center border border-[#E5E7EB] rounded-[8px] px-4 text-[13px] text-[#1A1A1A] bg-white no-underline hover:bg-[#F9FAFB] transition-colors">
              Cancel
            </a>
            <button type="submit"
                    class="h-9 bg-[#4A9FD8] text-white rounded-[8px] px-4 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
              Download CSV
            </button>
          </div>

        </div>
      </form>
    </div>
  </div>
</div>
