<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data }: { data: PageData } = $props();

  function buildUrl(params: Record<string, string | number>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, String(v));
    return '/admin/events?' + sp.toString();
  }
</script>

<AdminPageHead route="/admin/events" title={$t('admin.events')} subtitle={$t('admin.eventsSubtitle')}>
  {#snippet right()}
    <span class="num" style="font-size:13px;color:var(--mep-fg-3);">{$ti('admin.totalSuffix', { n: data.total.toLocaleString('en-US') })}</span>
  {/snippet}
</AdminPageHead>

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
    <span style="font-size:12px;color:var(--mep-fg-3);">{$t('admin.typeLabel')}</span>
    <a
      href={buildUrl({ page: 1 })}
      style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {!data.typeFilter ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};background:{!data.typeFilter ? 'var(--mep-acc)' : 'transparent'};color:{!data.typeFilter ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};"
    >{$t('admin.all')}</a>
    {#each data.availableTypes as type}
      <a
        href={buildUrl({ page: 1, type: type.type })}
        style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;border:1px solid {data.typeFilter === type.type ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};background:{data.typeFilter === type.type ? 'var(--mep-acc)' : 'transparent'};color:{data.typeFilter === type.type ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};"
      >{type.type} ({type.count})</a>
    {/each}
  </div>

  <HudPanel title={$t('admin.events')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{$t('admin.colType')}</th>
            <th scope="col" class="l">{$t('admin.colMessage')}</th>
            <th scope="col" class="l">{$t('admin.colRestaurant')}</th>
            <th scope="col" class="l">{$t('admin.colStatus')}</th>
            <th scope="col" class="r">{$t('admin.colDate')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.events as ev}
            <tr>
              <td class="mono dim">{ev.notification_type}</td>
              <td class="nowrap" style="max-width:360px;overflow:hidden;text-overflow:ellipsis;">{ev.message}</td>
              <td class="dim">{ev.restaurant_name ?? '—'}</td>
              <td class="mono" class:good={ev.status === 'resolved'} class:warn={ev.status === 'pending'} class:dim={ev.status === 'dismissed'}>{ev.status}</td>
              <td class="num r dim nowrap">
                {new Date(ev.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="empty">{$t('admin.noEvents')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  {#if data.totalPages > 1}
    <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
      {#if data.page > 1}
        <a
          href={buildUrl({ page: data.page - 1, type: data.typeFilter })}
          class="btn btn-secondary"
          style="text-decoration:none;"
        >{$t('admin.prev')}</a>
      {/if}
      <span style="font-size:13px;color:var(--mep-fg-3);">{$ti('admin.pageOf', { page: data.page, total: data.totalPages })}</span>
      {#if data.page < data.totalPages}
        <a
          href={buildUrl({ page: data.page + 1, type: data.typeFilter })}
          class="btn btn-secondary"
          style="text-decoration:none;"
        >{$t('admin.next')}</a>
      {/if}
    </div>
  {/if}

</div>
