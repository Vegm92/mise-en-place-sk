<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data }: { data: PageData } = $props();

  const STATUS_COLOR: Record<string, string> = {
    approved: 'var(--mep-pos)',
    pending:  'var(--mep-warn)',
    rejected: 'var(--mep-fg-3)',
  };
  const STATUS_BG: Record<string, string> = {
    approved: 'var(--mep-pos-soft)',
    pending:  'var(--mep-warn-soft)',
    rejected: 'var(--mep-hover)',
  };

  const TH = 'padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;';
</script>

<AdminPageHead route="/admin/users" title={$t('admin.users')} subtitle={$t('admin.usersSubtitle')}>
  {#snippet right()}
    <span class="num" style="font-size:13px;color:var(--mep-fg-3);">{$ti('admin.totalSuffix', { n: data.users.length.toLocaleString('en-US') })}</span>
  {/snippet}
</AdminPageHead>

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:16px;">

  <form method="GET" action="/admin/users" style="display:flex;gap:8px;align-items:center;">
    <input
      name="q"
      value={data.q}
      placeholder={$t('admin.usersSearchPlaceholder')}
      style="flex:1;max-width:320px;padding:6px 10px;border-radius:6px;font-size:13px;border:1px solid var(--mep-border-strong);background:var(--mep-surface);color:var(--mep-fg);"
    />
    <button type="submit" class="btn btn-secondary">{$t('admin.usersSearch')}</button>
  </form>

  <SectionCard title={$t('admin.users')} noPad>
    <AdminTableScroll>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th style={TH}>{$t('admin.colUser')}</th>
            <th style={TH}>{$t('admin.colRestaurant')}</th>
            <th style="{TH}text-align:center;">{$t('admin.colStatus')}</th>
            <th style="{TH}text-align:right;">{$t('admin.colEvents')}</th>
            <th style="{TH}text-align:right;">{$t('admin.colLastSeen')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.users as u}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:9px 16px;">
                <a href="/admin/users/{u.id}" style="color:var(--mep-acc);text-decoration:none;font-weight:600;">{u.name || u.email}</a>
                {#if u.name}
                  <div style="font-size:11px;color:var(--mep-fg-3);">{u.email}</div>
                {/if}
              </td>
              <td style="padding:9px 16px;color:var(--mep-fg-2);font-size:12px;">{u.restaurants ?? '—'}</td>
              <td style="padding:9px 16px;text-align:center;">
                <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:{STATUS_BG[u.access_status] ?? 'var(--mep-hover)'};color:{STATUS_COLOR[u.access_status] ?? 'var(--mep-fg-3)'};">
                  {u.access_status}
                </span>
              </td>
              <td class="num" style="padding:9px 16px;text-align:right;color:var(--mep-fg);">{u.event_count.toLocaleString('en-US')}</td>
              <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-3);font-size:12px;white-space:nowrap;">
                {u.last_event_at
                  ? new Date(u.last_event_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
                  : $t('admin.never')}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" style="padding:32px 16px;text-align:center;color:var(--mep-fg-4);">{$t('admin.noUsers')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </SectionCard>

</div>
