<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import { Check } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="p-6 flex flex-col gap-4">

  {#if !data.overdue.length && !data.due_soon.length}
    <p class="body text-center py-16">{$t('rem.empty')}</p>
  {:else}

    <!-- Summary chips -->
    <div class="flex gap-2 flex-wrap">
      {#if data.overdue.length}
        <div class="card px-3 py-2 bg-neg-soft border-neg" style="font-size:13px;">
          <strong class="text-neg">{data.overdue.length}</strong>
          <span class="text-fg-2"> {$t('rem.overdue').toLowerCase()}</span>
        </div>
      {/if}
      <div class="card px-3 py-2" style="font-size:13px;">
        <strong class="text-fg">{data.due_soon.length}</strong>
        <span class="text-fg-2"> {$t('rem.dueWeek').toLowerCase()}</span>
      </div>
      <div class="card px-3 py-2" style="font-size:13px;">
        <span class="text-fg-2">{$t('rem.totalPending')}:</span>
        <strong class="text-fg num"> {Math.round(data.total_amount)} EUR</strong>
      </div>
    </div>

    <!-- Overdue section -->
    {#if data.overdue.length}
      <SectionCard title={$t('rem.overdue')} noPad>
        {#each data.overdue as r (r.id)}
          <div class="grid items-center gap-3 px-4 py-3 border-b border-divider last:border-0 hover:bg-hover transition-colors
                       max-md:grid-cols-[1fr_auto]"
            style="grid-template-columns:1fr 120px 100px auto auto;">
            <div class="min-w-0">
              <p class="body-strong overflow-hidden text-ellipsis whitespace-nowrap">{r.supplier_name ?? '—'}</p>
              <p class="body text-fg-3" style="font-size:12px;margin-top:2px;">{r.invoice_number ?? '—'}</p>
            </div>
            <p class="num font-semibold text-right" style="font-size:13px;">{Math.round(r.display_amount)} EUR</p>
            <p class="body text-fg-3 text-right max-md:hidden" style="font-size:12px;">{r.due_date}</p>
            <span class="badge badge-overdue">{Math.abs(r.days_delta)}{$t('rem.daysOverdue')}</span>
            <form method="post" action="?/markPaid">
              <input type="hidden" name="invoiceId" value={r.id} />
              <button type="submit" class="btn btn-ghost text-pos" style="height:28px;font-size:12px;gap:4px;">
                <Check size={12} />{$t('inv.markPaid')}
              </button>
            </form>
          </div>
        {/each}
      </SectionCard>
    {/if}

    <!-- Due soon section -->
    {#if data.due_soon.length}
      <SectionCard title={$t('rem.dueWeek')} noPad>
        {#each data.due_soon as r (r.id)}
          <div class="grid items-center gap-3 px-4 py-3 border-b border-divider last:border-0 hover:bg-hover transition-colors
                       max-md:grid-cols-[1fr_auto]"
            style="grid-template-columns:1fr 120px 100px auto auto;">
            <div class="min-w-0">
              <p class="body-strong overflow-hidden text-ellipsis whitespace-nowrap">{r.supplier_name ?? '—'}</p>
              <p class="body text-fg-3" style="font-size:12px;margin-top:2px;">{r.invoice_number ?? '—'}</p>
            </div>
            <p class="num font-semibold text-right" style="font-size:13px;">{Math.round(r.display_amount)} EUR</p>
            <p class="body text-fg-3 text-right max-md:hidden" style="font-size:12px;">{r.due_date}</p>
            <span class="badge badge-pending">{r.days_delta}{$t('misc.daysLeft')}</span>
            <form method="post" action="?/markPaid">
              <input type="hidden" name="invoiceId" value={r.id} />
              <button type="submit" class="btn btn-ghost text-pos" style="height:28px;font-size:12px;gap:4px;">
                <Check size={12} />{$t('inv.markPaid')}
              </button>
            </form>
          </div>
        {/each}
      </SectionCard>
    {/if}

  {/if}
</div>
