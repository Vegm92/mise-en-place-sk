<script lang="ts">
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-[560px] mx-auto">

  <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-6 py-8 mb-4 text-center">
    <div class="text-4xl mb-3">✅</div>
    <h2 class="text-[16px] font-semibold text-[#1A1A1A] mb-2">Invoice saved successfully</h2>
    <p class="text-[13px] text-[#888888]">
      Invoice #{data.invoiceId} has been stored and is ready for review.
    </p>
  </div>

  {#if data.alerts.length > 0}
    <div class="bg-white rounded-[12px] border border-[#E5E7EB] px-6 py-5 mb-4">
      <h2 class="text-[14px] font-semibold text-[#1A1A1A] mb-3">Alerts generated</h2>
      <div class="flex flex-col gap-2">
        {#each data.alerts as alert}
          <div class="bg-[#FFF8EE] border border-[#F5D08A] text-[#C8843A] rounded-[8px] px-4 py-3 text-[13px]">
            {alert.message}
          </div>
        {/each}
      </div>
      <p class="text-[12px] text-[#888888] mt-3">
        These alerts have been queued for WhatsApp delivery.
      </p>
    </div>
  {:else}
    <div class="bg-[#EFF8FF] border border-[#BDE0F8] text-[#4A9FD8] rounded-[8px] px-4 py-3 text-[13px] mb-4">
      No alerts for this invoice — all prices and stock levels look normal.
    </div>
  {/if}

  <div class="flex gap-3">
    <a href="/invoices"
       class="h-9 flex items-center bg-[#4A9FD8] text-white rounded-[8px] px-4 text-[13px] font-semibold no-underline hover:bg-[#3d8ec7] transition-colors">
      Go to Invoices
    </a>
    <a href="/"
       class="h-9 flex items-center bg-white border border-[#E5E7EB] text-[#1A1A1A] rounded-[8px] px-4 text-[13px] font-semibold no-underline hover:bg-[#F9FAFB] transition-colors">
      Upload another
    </a>
  </div>

</div>
