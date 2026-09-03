<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const STATUS_FILTERS = ['pending', 'resolved', 'dismissed'];

  function buildUrl(params: Record<string, string | number>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, String(v));
    return '/admin/events?' + sp.toString();
  }

  function pillClass(active: boolean): string {
    return `px-2.5 py-1 rounded text-xs no-underline border ${active ? 'border-acc bg-acc text-acc-fg' : 'border-border-strong bg-transparent text-fg-2'}`;
  }
</script>

<AdminPageHead route="/admin/events" title={$t('admin.events')} subtitle={$t('admin.eventsSubtitle')}>
  {#snippet right()}
    <span class="num text-[13px] text-fg-3">{$ti('admin.totalSuffix', { n: data.total.toLocaleString('en-US') })}</span>
  {/snippet}
</AdminPageHead>

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  <div class="flex gap-1.5 flex-wrap items-center">
    <span class="text-xs text-fg-3">{$t('admin.typeLabel')}</span>
    <a
      href={buildUrl({ page: 1, status: data.statusFilter, q: data.q })}
      class={pillClass(!data.typeFilter)}
    >{$t('admin.all')}</a>
    {#each data.availableTypes as type}
      <a
        href={buildUrl({ page: 1, type: type.type, status: data.statusFilter, q: data.q })}
        class={pillClass(data.typeFilter === type.type)}
      >{type.type} ({type.count})</a>
    {/each}
  </div>

  <div class="flex gap-1.5 flex-wrap items-center">
    <span class="text-xs text-fg-3">{$t('admin.statusLabel')}</span>
    <a
      href={buildUrl({ page: 1, type: data.typeFilter, q: data.q })}
      class={pillClass(!data.statusFilter)}
    >{$t('admin.all')}</a>
    {#each STATUS_FILTERS as s}
      <a
        href={buildUrl({ page: 1, type: data.typeFilter, status: s, q: data.q })}
        class={pillClass(data.statusFilter === s)}
      >{s}</a>
    {/each}
  </div>

  <div class="flex gap-2.5 flex-wrap items-center">
    <form method="GET" action="/admin/events" class="flex gap-1.5 items-center flex-1 min-w-[240px]">
      <input type="hidden" name="type" value={data.typeFilter} />
      <input type="hidden" name="status" value={data.statusFilter} />
      <input
        type="search"
        name="q"
        value={data.q}
        placeholder={$t('admin.eventSearchPh')}
        class="input flex-1 min-w-[180px] h-[30px]"
      />
    </form>
    <form method="POST" action="?/resolveFiltered" use:enhance>
      <input type="hidden" name="type" value={data.typeFilter} />
      <input type="hidden" name="q" value={data.q} />
      <button type="submit" class="btn btn-secondary h-[30px] px-3 text-xs">{$t('admin.resolveFiltered')}</button>
    </form>
  </div>

  {#if form?.error}
    <div style="background:#0a0c11;border:1px solid rgba(248,113,113,0.35);border-radius:10px;padding:12px 14px;font:500 12px/1.4 ui-monospace, monospace;color:#f87171;">
      {$t('admin.actionFailed')}
    </div>
  {/if}

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
            <th scope="col" class="r">{$t('admin.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.events as ev}
            <tr>
              <td class="mono dim">{ev.notification_type}</td>
              <td class="nowrap" style="width:360px;max-width:360px;overflow:hidden;text-overflow:ellipsis;">{ev.message}</td>
              <td class="dim" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{ev.restaurant_name ?? '—'}</td>
              <td class="mono" class:good={ev.status === 'resolved'} class:warn={ev.status === 'pending'} class:dim={ev.status === 'dismissed'}>{ev.status}</td>
              <td class="num r dim nowrap">
                {new Date(ev.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td class="r nowrap">
                <div style="display:inline-flex;gap:6px;">
                  {#if ev.status === 'pending'}
                    <form method="POST" action="?/setStatus" use:enhance class="inline">
                      <input type="hidden" name="id" value={ev.id} />
                      <input type="hidden" name="status" value="resolved" />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{$t('admin.resolve')}</button>
                    </form>
                    <form method="POST" action="?/setStatus" use:enhance class="inline">
                      <input type="hidden" name="id" value={ev.id} />
                      <input type="hidden" name="status" value="dismissed" />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{$t('admin.dismiss')}</button>
                    </form>
                  {:else}
                    <form method="POST" action="?/setStatus" use:enhance class="inline">
                      <input type="hidden" name="id" value={ev.id} />
                      <input type="hidden" name="status" value="pending" />
                      <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{$t('admin.reopen')}</button>
                    </form>
                  {/if}
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="empty">{$t('admin.noEvents')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  {#if data.totalPages > 1}
    <div class="flex gap-1.5 items-center justify-center">
      {#if data.page > 1}
        <a
          href={buildUrl({ page: data.page - 1, type: data.typeFilter, status: data.statusFilter, q: data.q })}
          class="btn btn-secondary no-underline"
        >{$t('admin.prev')}</a>
      {/if}
      <span class="text-[13px] text-fg-3">{$ti('admin.pageOf', { page: data.page, total: data.totalPages })}</span>
      {#if data.page < data.totalPages}
        <a
          href={buildUrl({ page: data.page + 1, type: data.typeFilter, status: data.statusFilter, q: data.q })}
          class="btn btn-secondary no-underline"
        >{$t('admin.next')}</a>
      {/if}
    </div>
  {/if}

</div>
