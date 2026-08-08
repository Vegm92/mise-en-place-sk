<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  let { data }: { data: PageData } = $props();

  const STATUS_COLOR: Record<string, string> = {
    pending:  '#d97706',
    resolved: '#16a34a',
    dismissed: 'var(--mep-fg-3)',
  };

  function buildUrl(params: Record<string, string | number>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, String(v));
    return '/admin/events?' + sp.toString();
  }
</script>

<div style="padding:28px 32px;max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <h2 style="margin:0;font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">{$t('admin.events')}</h2>
    <span style="font-size:13px;color:var(--mep-fg-3);">{$ti('admin.totalSuffix', { n: data.total.toLocaleString('en-US') })}</span>
  </div>

  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
    <span style="font-size:12px;color:var(--mep-fg-3);">{$t('admin.typeLabel')}</span>
    <a
      href={buildUrl({ page: 1 })}
      style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {!data.typeFilter ? '#dc2626' : 'var(--mep-border-strong)'};background:{!data.typeFilter ? '#dc2626' : 'transparent'};color:{!data.typeFilter ? '#fff' : 'var(--mep-fg-2)'};"
    >{$t('admin.all')}</a>
    {#each data.availableTypes as t}
      <a
        href={buildUrl({ page: 1, type: t.type })}
        style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {data.typeFilter === t.type ? '#dc2626' : 'var(--mep-border-strong)'};background:{data.typeFilter === t.type ? '#dc2626' : 'transparent'};color:{data.typeFilter === t.type ? '#fff' : 'var(--mep-fg-2)'};"
      >{t.type} ({t.count})</a>
    {/each}
  </div>

  <div class="card" style="overflow:hidden;padding:0;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colType')}</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colMessage')}</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colRestaurant')}</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colStatus')}</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colDate')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.events as ev}
          <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
            <td style="padding:9px 16px;">
              <code style="font-size:11px;background:var(--mep-surface-2);padding:2px 6px;border-radius:3px;color:var(--mep-fg-2);">{ev.notification_type}</code>
            </td>
            <td style="padding:9px 16px;color:var(--mep-fg);max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{ev.message}</td>
            <td style="padding:9px 16px;color:var(--mep-fg-2);font-size:12px;">{ev.restaurant_name ?? '—'}</td>
            <td style="padding:9px 16px;text-align:center;">
              <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:{STATUS_COLOR[ev.status] ?? 'var(--mep-fg-3)'}22;color:{STATUS_COLOR[ev.status] ?? 'var(--mep-fg-3)'};">
                {ev.status}
              </span>
            </td>
            <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-3);font-size:12px;white-space:nowrap;">
              {new Date(ev.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" style="padding:32px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.noEvents')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if data.totalPages > 1}
    <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
      {#if data.page > 1}
        <a
          href={buildUrl({ page: data.page - 1, type: data.typeFilter })}
          style="padding:6px 14px;border-radius:5px;border:1px solid var(--mep-border-strong);font-size:13px;text-decoration:none;color:var(--mep-fg);"
        >{$t('admin.prev')}</a>
      {/if}
      <span style="font-size:13px;color:var(--mep-fg-3);">{$ti('admin.pageOf', { page: data.page, total: data.totalPages })}</span>
      {#if data.page < data.totalPages}
        <a
          href={buildUrl({ page: data.page + 1, type: data.typeFilter })}
          style="padding:6px 14px;border-radius:5px;border:1px solid var(--mep-border-strong);font-size:13px;text-decoration:none;color:var(--mep-fg);"
        >{$t('admin.next')}</a>
      {/if}
    </div>
  {/if}

</div>
