<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  let { data }: { data: PageData } = $props();

  const STATUS_COLOR: Record<string, string> = {
    pending:   'var(--mep-neg)',
    reviewed:  'var(--mep-warn)',
    replayed:  'var(--mep-pos)',
    discarded: 'var(--mep-fg-3)',
  };
  const STATUS_BG: Record<string, string> = {
    pending:   'var(--mep-neg-soft)',
    reviewed:  'var(--mep-warn-soft)',
    replayed:  'var(--mep-pos-soft)',
    discarded: 'var(--mep-hover)',
  };

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
</script>

<AdminPageHead
  route="/admin/dead-letters"
  title={$t('admin.dlq.title')}
  subtitle={$t('admin.dlq.subtitle')}
>
  {#snippet right()}
    <span class="num" style="font-size:13px;color:{data.pending > 0 ? 'var(--mep-neg)' : 'var(--mep-fg-3)'};">
      {$ti('admin.dlq.pendingSuffix', { n: data.pending.toLocaleString('en-US') })}
    </span>
  {/snippet}
</AdminPageHead>

<div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:16px;">

  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
    <span style="font-size:12px;color:var(--mep-fg-3);">{$t('admin.dlq.statusLabel')}</span>
    <a
      href={buildUrl({ page: 1, queue: data.queue })}
      style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {!data.status ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};background:{!data.status ? 'var(--mep-acc)' : 'transparent'};color:{!data.status ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};"
    >{$t('admin.all')}</a>
    {#each STATUS_FILTERS as s}
      <a
        href={buildUrl({ page: 1, status: s, queue: data.queue })}
        style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {data.status === s ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};background:{data.status === s ? 'var(--mep-acc)' : 'transparent'};color:{data.status === s ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};"
      >{$t(`admin.dlq.status.${s}`)}</a>
    {/each}
  </div>

  {#if data.breakdown.length > 0}
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:12px;color:var(--mep-fg-3);">{$t('admin.dlq.queueLabel')}</span>
      <a
        href={buildUrl({ page: 1, status: data.status })}
        style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {!data.queue ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};background:{!data.queue ? 'var(--mep-acc)' : 'transparent'};color:{!data.queue ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};"
      >{$t('admin.all')}</a>
      {#each data.breakdown as q}
        <a
          href={buildUrl({ page: 1, status: data.status, queue: q.queue })}
          style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {data.queue === q.queue ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};background:{data.queue === q.queue ? 'var(--mep-acc)' : 'transparent'};color:{data.queue === q.queue ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};"
        >{q.queue} ({q.pending}/{q.total})</a>
      {/each}
    </div>
  {/if}

  <SectionCard title={$t('admin.dlq.title')} noPad>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid var(--mep-divider);">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.dlq.colQueue')}</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.dlq.colError')}</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colRestaurant')}</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.dlq.colOccurrences')}</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colStatus')}</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.dlq.colLastSeen')}</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.dlq.colActions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.entries as entry}
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <td style="padding:9px 16px;">
              <code style="font-size:11px;background:var(--mep-surface-2);padding:2px 6px;border-radius:3px;color:var(--mep-fg-2);">{entry.queue}</code>
            </td>
            <td style="padding:9px 16px;max-width:340px;">
              <button
                type="button"
                onclick={() => (expanded = expanded === entry.id ? null : entry.id)}
                style="all:unset;cursor:pointer;display:block;max-width:100%;"
              >
                <code style="font-size:11px;color:var(--mep-neg);">{entry.errorClass}</code>
                <div style="color:var(--mep-fg-2);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{entry.errorMessage}</div>
              </button>
            </td>
            <td style="padding:9px 16px;color:var(--mep-fg-2);font-size:12px;">{entry.restaurantName ?? '—'}</td>
            <td class="num" style="padding:9px 16px;text-align:center;color:var(--mep-fg-2);font-size:12px;">{entry.occurrences}</td>
            <td style="padding:9px 16px;text-align:center;">
              <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:{STATUS_BG[entry.status] ?? 'var(--mep-hover)'};color:{STATUS_COLOR[entry.status] ?? 'var(--mep-fg-3)'};">
                {$t(`admin.dlq.status.${entry.status}`)}
              </span>
            </td>
            <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg-3);font-size:12px;white-space:nowrap;">
              {new Date(entry.lastSeenAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
            </td>
            <td style="padding:9px 16px;text-align:right;white-space:nowrap;">
              <div style="display:inline-flex;gap:6px;">
                {#if entry.replayable && entry.status !== 'replayed'}
                  <form method="POST" action="?/replay" style="display:inline;">
                    <input type="hidden" name="id" value={entry.id} />
                    <button type="submit" class="btn btn-secondary" style="font-size:11px;padding:3px 8px;">{$t('admin.dlq.replay')}</button>
                  </form>
                {/if}
                {#if entry.status === 'pending'}
                  <form method="POST" action="?/setStatus" style="display:inline;">
                    <input type="hidden" name="id" value={entry.id} />
                    <input type="hidden" name="status" value="reviewed" />
                    <button type="submit" class="btn btn-secondary" style="font-size:11px;padding:3px 8px;">{$t('admin.dlq.markReviewed')}</button>
                  </form>
                  <form method="POST" action="?/setStatus" style="display:inline;">
                    <input type="hidden" name="id" value={entry.id} />
                    <input type="hidden" name="status" value="discarded" />
                    <button type="submit" class="btn btn-secondary" style="font-size:11px;padding:3px 8px;">{$t('admin.dlq.discard')}</button>
                  </form>
                {/if}
              </div>
            </td>
          </tr>
          {#if expanded === entry.id}
            <tr style="border-bottom:1px solid var(--mep-divider);background:var(--mep-surface-2);">
              <td colspan="7" style="padding:12px 16px;">
                <div class="num" style="font-size:11.5px;color:var(--mep-fg-2);margin-bottom:8px;">
                  {$ti('admin.dlq.detailMeta', {
                    source: entry.sourceId ?? '—',
                    job: entry.jobId ?? '—',
                    attempt: entry.attempt,
                    first: new Date(entry.firstSeenAt).toLocaleString('en-GB'),
                  })}
                </div>
                <div style="font-size:12px;color:var(--mep-fg);margin-bottom:8px;white-space:pre-wrap;word-break:break-word;">{entry.errorMessage}</div>
                <pre style="margin:0;font-size:11px;color:var(--mep-fg-2);background:var(--mep-surface);padding:10px;border-radius:4px;overflow:auto;max-height:280px;">{payloadText(entry.payload)}</pre>
              </td>
            </tr>
          {/if}
        {:else}
          <tr>
            <td colspan="7" style="padding:32px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.dlq.empty')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </SectionCard>

  {#if data.totalPages > 1}
    <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
      {#if data.page > 1}
        <a href={buildUrl({ page: data.page - 1, status: data.status, queue: data.queue })} class="btn btn-secondary" style="text-decoration:none;">{$t('admin.prev')}</a>
      {/if}
      <span style="font-size:13px;color:var(--mep-fg-3);">{$ti('admin.pageOf', { page: data.page, total: data.totalPages })}</span>
      {#if data.page < data.totalPages}
        <a href={buildUrl({ page: data.page + 1, status: data.status, queue: data.queue })} class="btn btn-secondary" style="text-decoration:none;">{$t('admin.next')}</a>
      {/if}
    </div>
  {/if}

</div>
