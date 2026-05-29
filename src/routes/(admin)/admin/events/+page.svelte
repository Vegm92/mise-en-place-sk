<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const STATUS_COLOR: Record<string, string> = {
    pending:  '#d97706',
    resolved: '#16a34a',
    dismissed: '#888',
  };

  function buildUrl(params: Record<string, string | number>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, String(v));
    return '/admin/events?' + sp.toString();
  }
</script>

<div style="padding:28px 32px;max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <h2 style="margin:0;font-size:22px;font-weight:600;color:#111;letter-spacing:-0.3px;">Events</h2>
    <span style="font-size:13px;color:#888;">{data.total.toLocaleString('en-US')} total</span>
  </div>

  <!-- Type filter -->
  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
    <span style="font-size:12px;color:#888;">Type:</span>
    <a
      href={buildUrl({ page: 1 })}
      style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {!data.typeFilter ? '#dc2626' : '#ddd'};background:{!data.typeFilter ? '#dc2626' : 'transparent'};color:{!data.typeFilter ? '#fff' : '#555'};"
    >All</a>
    {#each data.availableTypes as t}
      <a
        href={buildUrl({ page: 1, type: t.type })}
        style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {data.typeFilter === t.type ? '#dc2626' : '#ddd'};background:{data.typeFilter === t.type ? '#dc2626' : 'transparent'};color:{data.typeFilter === t.type ? '#fff' : '#555'};"
      >{t.type} ({t.count})</a>
    {/each}
  </div>

  <!-- Table -->
  <div class="card" style="overflow:hidden;padding:0;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Type</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Message</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Restaurant</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Date</th>
        </tr>
      </thead>
      <tbody>
        {#each data.events as ev}
          <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
            <td style="padding:9px 16px;">
              <code style="font-size:11px;background:#f3f4f6;padding:2px 6px;border-radius:3px;color:#555;">{ev.notification_type}</code>
            </td>
            <td style="padding:9px 16px;color:#333;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{ev.message}</td>
            <td style="padding:9px 16px;color:#555;font-size:12px;">{ev.restaurant_name ?? '—'}</td>
            <td style="padding:9px 16px;text-align:center;">
              <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:{STATUS_COLOR[ev.status] ?? '#888'}22;color:{STATUS_COLOR[ev.status] ?? '#888'};">
                {ev.status}
              </span>
            </td>
            <td style="padding:9px 16px;text-align:right;color:#888;font-size:12px;white-space:nowrap;">
              {new Date(ev.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" style="padding:32px 16px;text-align:center;color:#aaa;">No events found</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  {#if data.totalPages > 1}
    <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
      {#if data.page > 1}
        <a
          href={buildUrl({ page: data.page - 1, type: data.typeFilter })}
          style="padding:6px 14px;border-radius:5px;border:1px solid #ddd;font-size:13px;text-decoration:none;color:#333;"
        >← Prev</a>
      {/if}
      <span style="font-size:13px;color:#888;">Page {data.page} of {data.totalPages}</span>
      {#if data.page < data.totalPages}
        <a
          href={buildUrl({ page: data.page + 1, type: data.typeFilter })}
          style="padding:6px 14px;border-radius:5px;border:1px solid #ddd;font-size:13px;text-decoration:none;color:#333;"
        >Next →</a>
      {/if}
    </div>
  {/if}

</div>
