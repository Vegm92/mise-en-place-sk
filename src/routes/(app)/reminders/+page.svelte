<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

{#if !data.overdue.length && !data.due_soon.length}
  <p class="text-center py-12 text-[#888888] text-[13px]">No pending invoices due in the next 7 days.</p>
{:else}
  <div class="flex gap-2 mb-5 flex-wrap">
    {#if data.overdue.length}
      <div class="bg-[#FFF1F0] border border-[#FECACA] rounded-[8px] py-2 px-3 text-[13px] text-[#888888]">
        <strong class="text-[#E05555]">{data.overdue.length}</strong> overdue
      </div>
    {/if}
    <div class="bg-white border border-[#E5E7EB] rounded-[8px] py-2 px-3 text-[13px] text-[#888888]">
      <strong class="text-[#1A1A1A]">{data.due_soon.length}</strong> due this week
    </div>
    <div class="bg-white border border-[#E5E7EB] rounded-[8px] py-2 px-3 text-[13px] text-[#888888]">
      Total pending: <strong class="text-[#1A1A1A]">{Math.round(data.total_amount)} EUR</strong>
    </div>
  </div>

  <div class="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
    {#if data.overdue.length}
      <div class="text-[11px] font-bold tracking-[0.07em] uppercase text-[#888888] px-4 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">Overdue</div>
      {#each data.overdue as r (r.id)}
        <div class="grid grid-cols-[1fr_120px_100px_auto_auto] items-center gap-3 px-4 py-3 border-b border-[#F3F4F6] hover:bg-[#FAFAFA] max-md:grid-cols-[1fr_auto]">
          <div>
            <p class="font-semibold text-[13px] text-[#1A1A1A]">{r.supplier_name ?? '—'}</p>
            <p class="text-[12px] text-[#888888] mt-[2px]">{r.invoice_number ?? 'No invoice #'}</p>
          </div>
          <p class="font-bold text-[13px] text-right text-[#1A1A1A]">{Math.round(r.display_amount)} EUR</p>
          <p class="text-[12px] text-[#888888] text-right max-md:hidden">{r.due_date}</p>
          <span class="text-[10px] font-semibold px-2 py-[2px] rounded-full bg-[#FFF1F0] text-[#E05555]">{Math.abs(r.days_delta)}d overdue</span>
          <form method="post" action="?/markPaid">
            <input type="hidden" name="invoiceId" value={r.id} />
            <button type="submit"
                    class="text-[12px] font-semibold py-1 px-3 bg-[#F0FDF4] text-[#3A8C5C] border-none rounded-[6px] cursor-pointer hover:bg-[#DCFCE7] whitespace-nowrap transition-colors">
              ✓ Mark paid
            </button>
          </form>
        </div>
      {/each}
    {/if}

    {#if data.due_soon.length}
      <div class="text-[11px] font-bold tracking-[0.07em] uppercase text-[#888888] px-4 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">Due this week</div>
      {#each data.due_soon as r (r.id)}
        <div class="grid grid-cols-[1fr_120px_100px_auto_auto] items-center gap-3 px-4 py-3 border-b border-[#F3F4F6] last:border-0 hover:bg-[#FAFAFA] max-md:grid-cols-[1fr_auto]">
          <div>
            <p class="font-semibold text-[13px] text-[#1A1A1A]">{r.supplier_name ?? '—'}</p>
            <p class="text-[12px] text-[#888888] mt-[2px]">{r.invoice_number ?? 'No invoice #'}</p>
          </div>
          <p class="font-bold text-[13px] text-right text-[#1A1A1A]">{Math.round(r.display_amount)} EUR</p>
          <p class="text-[12px] text-[#888888] text-right max-md:hidden">{r.due_date}</p>
          <span class="text-[10px] font-semibold px-2 py-[2px] rounded-full bg-[#FFF8EE] text-[#C8843A]">{r.days_delta}d left</span>
          <form method="post" action="?/markPaid">
            <input type="hidden" name="invoiceId" value={r.id} />
            <button type="submit"
                    class="text-[12px] font-semibold py-1 px-3 bg-[#F0FDF4] text-[#3A8C5C] border-none rounded-[6px] cursor-pointer hover:bg-[#DCFCE7] whitespace-nowrap transition-colors">
              ✓ Mark paid
            </button>
          </form>
        </div>
      {/each}
    {/if}
  </div>
{/if}
