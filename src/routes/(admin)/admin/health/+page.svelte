<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminStatusBadge from '$lib/components/admin/AdminStatusBadge.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data }: { data: PageData } = $props();

  const isOk = $derived(data.overallStatus === 'ok');

  type Severity = 'info' | 'warning' | 'critical';
  const SEVERITY_STATUS: Record<Severity, 'ok' | 'warn' | 'error'> = {
    info: 'ok', warning: 'warn', critical: 'error',
  };
</script>

<AdminPageHead route="/admin/health" title={$t('admin.systemHealth')} subtitle={$t('admin.healthSubtitle')} />

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  <HudPanel title={$t('admin.status')} sub={$ti('admin.checkedAt', { time: new Date(data.checkedAt).toLocaleString('en-GB') })}>
    <div class="hud-kpi-row">
      <div class="hud-kpi">
        <div class="hud-kpi-label">{$t('admin.status')}</div>
        <div class="hud-kpi-value" class:good={isOk} class:bad={!isOk}>{data.overallStatus.toUpperCase()}</div>
      </div>
    </div>
  </HudPanel>

  <HudPanel title={$t('admin.checksTitle')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{$t('admin.colCheck')}</th>
            <th scope="col" class="l">{$t('admin.colStatus')}</th>
            <th scope="col" class="l">{$t('admin.colDetail')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.checks as check}
            <tr>
              <td>{check.name}</td>
              <td><AdminStatusBadge status={check.status} /></td>
              <td class="dim">
                {check.detail}
                {#if check.href}
                  <a href={check.href} class="text-acc no-underline ml-1.5">{check.href}</a>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  {#if data.stuckItems.length > 0}
    <HudPanel title={$t('admin.health.stuckTitle')} sub={$t('admin.health.stuckSubtitle')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.colRestaurant')}</th>
              <th scope="col" class="l">{$t('admin.health.colFile')}</th>
              <th scope="col" class="l">{$t('admin.colStatus')}</th>
              <th scope="col" class="r">{$t('admin.health.colStuckSince')}</th>
              <th scope="col" class="r">{$t('admin.dlq.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.stuckItems as item (item.id)}
              <tr>
                <td class="dim" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{item.restaurantName ?? '—'}</td>
                <td class="dim" style="width:260px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{item.displayName}</td>
                <td class="mono dim">{item.status}</td>
                <td class="num r dim nowrap">
                  {new Date(item.updatedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td class="r nowrap">
                  <form method="POST" action="?/retry" class="inline">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="restaurantId" value={item.restaurantId} />
                    <button type="submit" class="btn btn-secondary text-[11px] px-2 py-[3px]">{$t('admin.health.retry')}</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>
  {/if}

  {#if data.whatsapp}
    <HudPanel title={$t('admin.wa.numberHealth')}>
      <div class="p-3 flex flex-col gap-3">
        {#if !data.whatsapp.health.everReported}
          <p class="m-0 text-[12px]" style="color:#5b6472;">
            {$ti('admin.wa.noEvents', { fields: 'account_update / phone_number_quality_update' })}
          </p>
        {:else}
          <div class="hud-kpi-row">
            <div class="hud-kpi">
              <div class="hud-kpi-label">{$t('admin.wa.quality')}</div>
              <div class="hud-kpi-value"
                class:good={data.whatsapp.health.qualityRating === 'GREEN'}
                class:warn={data.whatsapp.health.qualityRating === 'YELLOW'}
                class:bad={data.whatsapp.health.qualityRating === 'RED'}>
                {data.whatsapp.health.qualityRating ?? 'unknown'}
              </div>
            </div>
            <div class="hud-kpi">
              <div class="hud-kpi-label">{$t('admin.wa.messagingLimit')}</div>
              <div class="hud-kpi-value">{data.whatsapp.health.messagingLimit ?? 'unknown'}</div>
            </div>
            <div class="hud-kpi">
              <div class="hud-kpi-label">{$t('admin.wa.worst30d')}</div>
              <div><AdminStatusBadge status={SEVERITY_STATUS[data.whatsapp.health.severity]} /></div>
            </div>
          </div>
        {/if}

        {#if data.whatsapp.events.length > 0}
          <AdminTableScroll>
            <table class="hud-table">
              <thead>
                <tr>
                  <th scope="col" class="l">{$t('admin.wa.colWhen')}</th>
                  <th scope="col" class="l">{$t('admin.wa.colEvent')}</th>
                  <th scope="col" class="l">{$t('admin.wa.colSeverity')}</th>
                  <th scope="col" class="l">{$t('admin.wa.quality')}</th>
                </tr>
              </thead>
              <tbody>
                {#each data.whatsapp.events as evt (evt.id)}
                  <tr>
                    <td class="dim nowrap">
                      {evt.receivedAt ? new Date(evt.receivedAt).toLocaleString('en-GB') : '—'}
                    </td>
                    <td class="mono">{evt.field}/{evt.event ?? 'unknown'}</td>
                    <td><AdminStatusBadge status={SEVERITY_STATUS[evt.severity as Severity]} /></td>
                    <td class="dim">{evt.qualityRating ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </AdminTableScroll>
        {/if}

        {#if data.whatsapp.tenants.length > 0}
          <div style="font:600 10px/1 ui-monospace, monospace;letter-spacing:0.12em;text-transform:uppercase;color:#e7edf5;">{$t('admin.wa.tenantSenders')}</div>
          <AdminTableScroll>
            <table class="hud-table">
              <tbody>
                {#each data.whatsapp.tenants as tenant (tenant.restaurantId)}
                  <tr>
                    <td>{tenant.name}</td>
                    <td class="num r dim">{tenant.contacts}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </AdminTableScroll>
        {/if}
      </div>
    </HudPanel>
  {/if}

  {#if data.tableCounts.length > 0}
    <HudPanel title={$t('admin.tableRowCounts')}>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.colTable')}</th>
              <th scope="col" class="r">{$t('admin.colRowsEst')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.tableCounts as row}
              <tr>
                <td class="mono dim">{row.table}</td>
                <td class="num r">{row.rows.toLocaleString('en-US')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>
  {/if}

  <a href="/admin" class="text-[13px] text-acc no-underline">{$t('admin.backToOverview')}</a>

</div>
