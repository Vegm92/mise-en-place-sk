<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data }: { data: PageData } = $props();

  const STATUS_CLASS: Record<string, string> = {
    pending:   'bg-neg-soft text-neg',
    reviewed:  'bg-warn-soft text-warn',
    replayed:  'bg-pos-soft text-pos',
    discarded: 'bg-hover text-fg-3',
  };
  const STATUS_CLASS_FALLBACK = 'bg-hover text-fg-3';

  const STATUS_FILTERS = ['pending', 'reviewed', 'replayed', 'discarded'];

  let expanded = $state<number | null>(null);

  function buildUrl(params: Record<string, string | number>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, String(v));
    return '/admin/dead-letters?' + sp.toString();
  }

  function payloadText(payload: unknown): string {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }

  function pillClass(active: boolean): string {
    return `px-2.5 py-1 rounded text-xs no-underline border ${active ? 'border-acc bg-acc text-acc-fg' : 'border-border-strong bg-transparent text-fg-2'}`;
  }
</script>

<AdminPageHead
  route="/admin/dead-letters"
  title={$t('admin.dlq.title')}
  subtitle={$t('admin.dlq.subtitle')}
>
  {#snippet right()}
    <span class="num text-[13px] {data.pending > 0 ? 'text-neg' : 'text-fg-3'}">
      {$ti('admin.dlq.pendingSuffix', { n: data.pending.toLocaleString('en-US') })}
    </span>
  {/snippet}
</AdminPageHead>

<div class="px-3 md:px-6 pb-6 flex flex-col gap-4">

  <div class="flex gap-1.5 flex-wrap items-center">
    <span class="text-xs text-fg-3">{$t('admin.dlq.statusLabel')}</span>
    <a
      href={buildUrl({ page: 1, queue: data.queue })}
      class={pillClass(!data.status)}
    >{$t('admin.all')}</a>
    {#each STATUS_FILTERS as s}
      <a
        href={buildUrl({ page: 1, status: s, queue: data.queue })}
        class={pillClass(data.status === s)}
      >{$t(`admin.dlq.status.${s}`)}</a>
    {/each}
  </div>

  {#if data.breakdown.length > 0}
    <div class="flex gap-1.5 flex-wrap items-center">
      <span class="text-xs text-fg-3">{$t('admin.dlq.queueLabel')}</span>
      <a
        href={buildUrl({ page: 1, status: data.status })}
        class={pillClass(!data.queue)}
      >{$t('admin.all')}</a>
      {#each data.breakdown as q}
        <a
          href={buildUrl({ page: 1, status: data.status, queue: q.queue })}
          class={pillClass(data.queue === q.queue)}
        >{q.queue} ({q.pending}/{q.total})</a>
      {/each}
    </div>
  {/if}

  <SectionCard title={$t('admin.dlq.title')} noPad>
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.dlq.colQueue')}</th>
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.dlq.colError')}</th>
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colRestaurant')}</th>
            <th scope="col" class="py-2.5 px-4 text-center text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.dlq.colOccurrences')}</th>
            <th scope="col" class="py-2.5 px-4 text-center text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colStatus')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.dlq.colLastSeen')}</th>
            <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.dlq.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.entries as entry}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4">
                <code class="text-[11px] bg-surface-2 px-1.5 py-0.5 rounded-[3px] text-fg-2">{entry.queue}</code>
              </td>
              <td class="py-[9px] px-4 max-w-[340px]">
                <button
                  type="button"
                  onclick={() => (expanded = expanded === entry.id ? null : entry.id)}
                  class="[all:unset] cursor-pointer block max-w-full"
                >
                  <code class="text-[11px] text-neg">{entry.errorClass}</code>
                  <div class="text-fg-2 text-xs overflow-hidden text-ellipsis whitespace-nowrap">{entry.errorMessage}</div>
                </button>
              </td>
              <td class="py-[9px] px-4 text-fg-2 text-xs">{entry.restaurantName ?? '—'}</td>
              <td class="num py-[9px] px-4 text-center text-fg-2 text-xs">{entry.occurrences}</td>
              <td class="py-[9px] px-4 text-center">
                <span class="inline-block px-2 py-0.5 rounded-[10px] text-[11px] font-semibold {STATUS_CLASS[entry.status] ?? STATUS_CLASS_FALLBACK}">
                  {$t(`admin.dlq.status.${entry.status}`)}
                </span>
              </td>
              <td class="num py-[9px] px-4 text-right text-fg-3 text-xs whitespace-nowrap">
                {new Date(entry.lastSeenAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td class="py-[9px] px-4 text-right whitespace-nowrap">
                <div class="inline-flex gap-1.5">
                  {#if entry.replayable && entry.status !== 'replayed'}
                    <form method="POST" action="?/replay" class="inline">
                      <input type="hidden" name="id" value={entry.id} />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{$t('admin.dlq.replay')}</button>
                    </form>
                  {/if}
                  {#if entry.status === 'pending'}
                    <form method="POST" action="?/setStatus" class="inline">
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="status" value="reviewed" />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{$t('admin.dlq.markReviewed')}</button>
                    </form>
                    <form method="POST" action="?/setStatus" class="inline">
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="status" value="discarded" />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{$t('admin.dlq.discard')}</button>
                    </form>
                  {/if}
                </div>
              </td>
            </tr>
            {#if expanded === entry.id}
              <tr class="border-b border-divider bg-surface-2">
                <td colspan="7" class="py-3 px-4">
                  <div class="num text-[11.5px] text-fg-2 mb-2">
                    {$ti('admin.dlq.detailMeta', {
                      source: entry.sourceId ?? '—',
                      job: entry.jobId ?? '—',
                      attempt: entry.attempt,
                      first: new Date(entry.firstSeenAt).toLocaleString('en-GB'),
                    })}
                  </div>
                  <div class="text-xs text-fg mb-2 whitespace-pre-wrap break-words">{entry.errorMessage}</div>
                  <pre class="m-0 text-[11px] text-fg-2 bg-surface p-2.5 rounded-[4px] overflow-auto max-h-[280px]">{payloadText(entry.payload)}</pre>
                </td>
              </tr>
            {/if}
          {:else}
            <tr>
              <td colspan="7" class="py-8 px-4 text-center text-fg-4">{$t('admin.dlq.empty')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

  {#if data.totalPages > 1}
    <div class="flex gap-1.5 items-center justify-center">
      {#if data.page > 1}
        <a href={buildUrl({ page: data.page - 1, status: data.status, queue: data.queue })} class="btn btn-secondary no-underline">{$t('admin.prev')}</a>
      {/if}
      <span class="text-[13px] text-fg-3">{$ti('admin.pageOf', { page: data.page, total: data.totalPages })}</span>
      {#if data.page < data.totalPages}
        <a href={buildUrl({ page: data.page + 1, status: data.status, queue: data.queue })} class="btn btn-secondary no-underline">{$t('admin.next')}</a>
      {/if}
    </div>
  {/if}

</div>
