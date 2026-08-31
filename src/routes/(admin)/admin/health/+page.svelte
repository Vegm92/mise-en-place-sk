<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminStatusBadge from '$lib/components/admin/AdminStatusBadge.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import Check from '@lucide/svelte/icons/check';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data }: { data: PageData } = $props();

  const isOk = $derived(data.overallStatus === 'ok');

  const QUALITY_TEXT_CLASS: Record<string, string> = {
    GREEN: 'text-pos', YELLOW: 'text-warn', RED: 'text-neg',
  };

  type Severity = 'info' | 'warning' | 'critical';
  const SEVERITY_STATUS: Record<Severity, 'ok' | 'warn' | 'error'> = {
    info: 'ok', warning: 'warn', critical: 'error',
  };
</script>

<AdminPageHead route="/admin/health" title={$t('admin.systemHealth')} subtitle={$t('admin.healthSubtitle')} />

<div class="px-3 md:px-6 pb-6 flex flex-col gap-3.5">

  <div class="card py-5 px-[22px] flex items-center justify-between gap-[18px] flex-wrap {isOk ? 'bg-pos-soft border-pos-soft' : 'bg-neg-soft border-neg-soft'}">
    <div class="flex items-center gap-4 min-w-0">
      <div class="w-11 h-11 rounded-full shrink-0 flex items-center justify-center ring-[6px] {isOk ? 'bg-pos text-pos-fg ring-pos-soft' : 'bg-neg text-neg-fg ring-neg-soft'}">
        {#if isOk}<Check size={22} />{:else}<AlertTriangle size={20} />{/if}
      </div>
      <div>
        <div class="num text-[11px] font-medium tracking-[0.08em] uppercase mb-1 {isOk ? 'text-pos' : 'text-neg'}">
          {$t('admin.status')}
        </div>
        <div class="text-[32px] font-semibold tracking-[-0.6px] leading-none {isOk ? 'text-pos' : 'text-neg'}">
          {data.overallStatus.toUpperCase()}
        </div>
      </div>
    </div>
    <div class="num text-[11.5px] text-fg-2 text-right leading-[1.55]">
      {$ti('admin.checkedAt', { time: new Date(data.checkedAt).toLocaleString('en-GB') })}
    </div>
  </div>

  <SectionCard title={$t('admin.checksTitle')} noPad>
    <AdminTableScroll>
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-divider">
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colCheck')}</th>
            <th scope="col" class="py-2.5 px-4 text-center text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colStatus')}</th>
            <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colDetail')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.checks as check}
            <tr class="border-b border-divider">
              <td class="py-[9px] px-4 font-medium text-fg">{check.name}</td>
              <td class="py-[9px] px-4 text-center"><AdminStatusBadge status={check.status} /></td>
              <td class="py-[9px] px-4 text-fg-2 text-xs">
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
  </SectionCard>

  {#if data.stuckItems.length > 0}
    <SectionCard title={$t('admin.health.stuckTitle')} sub={$t('admin.health.stuckSubtitle')} noPad>
      <AdminTableScroll>
        <table class="w-full border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-divider">
              <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colRestaurant')}</th>
              <th scope="col" class="py-2.5 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.health.colFile')}</th>
              <th scope="col" class="py-2.5 px-4 text-center text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colStatus')}</th>
              <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.health.colStuckSince')}</th>
              <th scope="col" class="py-2.5 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.dlq.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.stuckItems as item (item.id)}
              <tr class="border-b border-divider">
                <td class="py-[9px] px-4 text-fg">{item.restaurantName ?? '—'}</td>
                <td class="py-[9px] px-4 text-fg-2 max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap">{item.displayName}</td>
                <td class="py-[9px] px-4 text-center">
                  <code class="text-[11px] bg-surface-2 px-1.5 py-0.5 rounded text-fg-2">{item.status}</code>
                </td>
                <td class="num py-[9px] px-4 text-right text-fg-3 whitespace-nowrap">
                  {new Date(item.updatedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td class="py-[9px] px-4 text-right whitespace-nowrap">
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
    </SectionCard>
  {/if}

  {#if data.whatsapp}
    <div>
      <div class="label mb-2.5">{$t('admin.wa.numberHealth')}</div>

      {#if !data.whatsapp.health.everReported}
        <div class="card py-3.5 px-4 text-[13px] text-fg-2">
          {$ti('admin.wa.noEvents', { fields: 'account_update / phone_number_quality_update' })}
        </div>
      {:else}
        <div class="card py-3.5 px-4 flex gap-6 flex-wrap text-[13px]">
          <div>
            <div class="label mb-0.5">{$t('admin.wa.quality')}</div>
            <div class="font-semibold {QUALITY_TEXT_CLASS[data.whatsapp.health.qualityRating ?? ''] ?? 'text-fg'}">
              {data.whatsapp.health.qualityRating ?? 'unknown'}
            </div>
          </div>
          <div>
            <div class="label mb-0.5">{$t('admin.wa.messagingLimit')}</div>
            <div class="font-semibold text-fg">{data.whatsapp.health.messagingLimit ?? 'unknown'}</div>
          </div>
          <div>
            <div class="label mb-0.5">{$t('admin.wa.worst30d')}</div>
            <div><AdminStatusBadge status={SEVERITY_STATUS[data.whatsapp.health.severity]} /></div>
          </div>
        </div>
      {/if}

      {#if data.whatsapp.events.length > 0}
        <div class="card overflow-hidden p-0 mt-2.5">
          <AdminTableScroll>
            <table class="w-full border-collapse text-[13px]">
              <thead>
                <tr class="border-b border-divider">
                  <th scope="col" class="py-2 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.wa.colWhen')}</th>
                  <th scope="col" class="py-2 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.wa.colEvent')}</th>
                  <th scope="col" class="py-2 px-4 text-center text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.wa.colSeverity')}</th>
                  <th scope="col" class="py-2 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.wa.quality')}</th>
                </tr>
              </thead>
              <tbody>
                {#each data.whatsapp.events as evt (evt.id)}
                  <tr class="border-b border-divider">
                    <td class="py-[7px] px-4 text-fg-2 text-xs whitespace-nowrap">
                      {evt.receivedAt ? new Date(evt.receivedAt).toLocaleString('en-GB') : '—'}
                    </td>
                    <td class="py-[7px] px-4 font-mono text-xs text-fg">
                      {evt.field}/{evt.event ?? 'unknown'}
                    </td>
                    <td class="py-[7px] px-4 text-center"><AdminStatusBadge status={SEVERITY_STATUS[evt.severity as Severity]} /></td>
                    <td class="py-[7px] px-4 text-fg-2 text-xs">{evt.qualityRating ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </AdminTableScroll>
        </div>
      {/if}

      {#if data.whatsapp.tenants.length > 0}
        <div class="label mt-4 mb-2.5">{$t('admin.wa.tenantSenders')}</div>
        <div class="card overflow-hidden p-0">
          <AdminTableScroll>
            <table class="w-full border-collapse text-[13px]">
              <tbody>
                {#each data.whatsapp.tenants as tenant (tenant.restaurantId)}
                  <tr class="border-b border-divider">
                    <td class="py-[7px] px-4 text-fg">{tenant.name}</td>
                    <td class="num py-[7px] px-4 text-right text-fg-2">{tenant.contacts}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </AdminTableScroll>
        </div>
      {/if}
    </div>
  {/if}

  {#if data.tableCounts.length > 0}
    <SectionCard title={$t('admin.tableRowCounts')} noPad>
      <AdminTableScroll>
        <table class="w-full border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-divider">
              <th scope="col" class="py-2 px-4 text-left text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colTable')}</th>
              <th scope="col" class="py-2 px-4 text-right text-[11px] font-semibold text-fg-3 uppercase tracking-wider">{$t('admin.colRowsEst')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.tableCounts as row}
              <tr class="border-b border-divider">
                <td class="py-[7px] px-4 font-mono text-xs text-fg-2">{row.table}</td>
                <td class="num py-[7px] px-4 text-right text-fg">{row.rows.toLocaleString('en-US')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </SectionCard>
  {/if}

  <a href="/admin" class="text-[13px] text-acc no-underline">{$t('admin.backToOverview')}</a>

</div>
