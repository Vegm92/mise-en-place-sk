<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<div class="max-w-[480px] mx-auto flex flex-col gap-4">

  <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-5 py-4">
    <p class="text-[13px] text-[#666666]">
      Currency is fixed to <strong class="text-[#1A1A1A]">EUR (€)</strong>. Budget warning threshold can be adjusted below.
    </p>
  </div>

  <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-5 py-4">
    <p class="text-[11px] font-bold uppercase tracking-[0.05em] text-[#888888] mb-4">Budget Warning Threshold</p>
    <form method="post" action="?/saveThreshold" class="flex items-center gap-3">
      <input type="number" name="value" min="1" max="99" value={data.threshold}
             class="w-[90px] h-9 rounded-[6px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#1A1A1A] focus:outline-none focus:border-[#4A9FD8]" />
      <span class="text-[13px] text-[#888888]">%</span>
      <button type="submit"
              class="h-9 bg-[#4A9FD8] text-white rounded-[8px] px-4 text-[13px] font-semibold border-none cursor-pointer hover:bg-[#3d8ec7] transition-colors">
        Save
      </button>
    </form>
    <p class="text-[12px] text-[#888888] mt-3">
      Supplier cards and budget bars show a warning when spend reaches this % of the monthly budget.
    </p>
  </div>

</div>
