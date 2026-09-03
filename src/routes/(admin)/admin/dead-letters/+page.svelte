<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
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
  title={t('admin.dlq.title')}
  subtitle={t('admin.dlq.subtitle')}
>
  {#snippet right()}
    <span class="num text-[13px] {data.pending > 0 ? 'text-neg' : 'text-fg-3'}">
      {ti('admin.dlq.pendingSuffix', { n: data.pending.toLocaleString('en-US') })}
    </span>
  {/snippet}
</AdminPageHead>

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  <div class="flex gap-1.5 flex-wrap items-center">
    <span class="text-xs text-fg-3">{t('admin.dlq.statusLabel')}</span>
    <a
      href={buildUrl({ page: 1, queue: data.queue })}
      class={pillClass(!data.status)}
    >{t('admin.all')}</a>
    {#each STATUS_FILTERS as s}
      <a
        href={buildUrl({ page: 1, status: s, queue: data.queue })}
        class={pillClass(data.status === s)}
      >{t(`admin.dlq.status.${s}`)}</a>
    {/each}
  </div>

  {#if data.breakdown.length > 0}
    <div class="flex gap-1.5 flex-wrap items-center">
      <span class="text-xs text-fg-3">{t('admin.dlq.queueLabel')}</span>
      <a
        href={buildUrl({ page: 1, status: data.status })}
        class={pillClass(!data.queue)}
      >{t('admin.all')}</a>
      {#each data.breakdown as q}
        <a
          href={buildUrl({ page: 1, status: data.status, queue: q.queue })}
          class={pillClass(data.queue === q.queue)}
        >{q.queue} ({q.pending}/{q.total})</a>
      {/each}
    </div>
  {/if}

  <HudPanel title={t('admin.dlq.title')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{t('admin.dlq.colQueue')}</th>
            <th scope="col" class="l">{t('admin.dlq.colError')}</th>
            <th scope="col" class="l">{t('admin.colRestaurant')}</th>
            <th scope="col" class="r">{t('admin.dlq.colOccurrences')}</th>
            <th scope="col" class="l">{t('admin.colStatus')}</th>
            <th scope="col" class="r">{t('admin.dlq.colLastSeen')}</th>
            <th scope="col" class="r">{t('admin.dlq.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.entries as entry}
            <tr>
              <td class="mono dim">{entry.queue}</td>
              <td style="width:340px;max-width:340px;overflow:hidden;">
                <button
                  type="button"
                  onclick={() => (expanded = expanded === entry.id ? null : entry.id)}
                  class="[all:unset] cursor-pointer block max-w-full"
                >
                  <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace, monospace;color:#f87171;">{entry.errorClass}</span>
                  <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#5b6472;">{entry.errorMessage}</div>
                </button>
              </td>
              <td class="dim" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{entry.restaurantName ?? '—'}</td>
              <td class="num r">{entry.occurrences}</td>
              <td class:good={entry.status === 'replayed'} class:warn={entry.status === 'reviewed'} class:bad={entry.status === 'pending'} class:dim={entry.status === 'discarded'}>
                {t(`admin.dlq.status.${entry.status}`)}
              </td>
              <td class="num r dim nowrap">
                {new Date(entry.lastSeenAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td class="r nowrap">
                <div style="display:inline-flex;gap:6px;">
                  {#if entry.replayable && entry.status !== 'replayed'}
                    <form method="POST" action="?/replay" class="inline">
                      <input type="hidden" name="id" value={entry.id} />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{t('admin.dlq.replay')}</button>
                    </form>
                  {/if}
                  {#if entry.status === 'pending'}
                    <form method="POST" action="?/setStatus" class="inline">
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="status" value="reviewed" />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{t('admin.dlq.markReviewed')}</button>
                    </form>
                    <form method="POST" action="?/setStatus" class="inline">
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="status" value="discarded" />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{t('admin.dlq.discard')}</button>
                    </form>
                  {/if}
                </div>
              </td>
            </tr>
            {#if expanded === entry.id}
              <tr>
                <td colspan="7" style="background:rgba(255,255,255,0.02);padding:12px 14px;">
                  <div style="font:11px/1.4 ui-monospace, monospace;color:#5b6472;margin-bottom:8px;">
                    {ti('admin.dlq.detailMeta', {
                      source: entry.sourceId ?? '—',
                      job: entry.jobId ?? '—',
                      attempt: entry.attempt,
                      first: new Date(entry.firstSeenAt).toLocaleString('en-GB'),
                    })}
                  </div>
                  <div style="font-size:12px;color:#e7edf5;margin-bottom:8px;white-space:pre-wrap;word-break:break-word;">{entry.errorMessage}</div>
                  <pre style="margin:0;font:11px/1.4 ui-monospace, monospace;color:#e7edf5;background:#05070a;padding:10px;border-radius:4px;overflow:auto;max-height:280px;">{payloadText(entry.payload)}</pre>
                </td>
              </tr>
            {/if}
          {:else}
            <tr><td colspan="7" class="empty">{t('admin.dlq.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  {#if data.totalPages > 1}
    <div class="flex gap-1.5 items-center justify-center">
      {#if data.page > 1}
        <a href={buildUrl({ page: data.page - 1, status: data.status, queue: data.queue })} class="btn btn-secondary no-underline">{t('admin.prev')}</a>
      {/if}
      <span class="text-[13px] text-fg-3">{ti('admin.pageOf', { page: data.page, total: data.totalPages })}</span>
      {#if data.page < data.totalPages}
        <a href={buildUrl({ page: data.page + 1, status: data.status, queue: data.queue })} class="btn btn-secondary no-underline">{t('admin.next')}</a>
      {/if}
    </div>
  {/if}

</div>
