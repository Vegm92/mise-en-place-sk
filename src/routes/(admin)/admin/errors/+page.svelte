<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminStatusBadge from '$lib/components/admin/AdminStatusBadge.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data }: { data: PageData } = $props();

  const LEVEL_STATUS: Record<string, 'ok' | 'warn' | 'error'> = {
    fatal: 'error', error: 'error', warning: 'warn', info: 'ok', debug: 'ok',
  };
</script>

<AdminPageHead route="/admin/errors" title={$t('admin.errors')} subtitle={$t('admin.errorsSubtitle')} />

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  {#if !data.configured}
    <div style="background:#0a0c11;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 16px;font-size:13px;color:#5b6472;">
      {$t('admin.errorsNotConfigured')}
    </div>
  {:else}
    <HudPanel title={$t('admin.errors')}>
      <div class="hud-kpi-row">
        <div class="hud-kpi">
          <div class="hud-kpi-label">{$t('admin.errorsUnresolved')}</div>
          <div class="hud-kpi-value" class:warn={(data.summary?.unresolvedCount ?? 0) > 0}>{data.summary?.unresolvedCount ?? 0}</div>
        </div>
        <div class="hud-kpi">
          <div class="hud-kpi-label">{$t('admin.errorsCritical')}</div>
          <div class="hud-kpi-value" class:bad={(data.summary?.criticalCount ?? 0) > 0}>{data.summary?.criticalCount ?? 0}</div>
        </div>
        <div class="hud-kpi">
          <div class="hud-kpi-label">{$t('admin.errorsUsersAffected')}</div>
          <div class="hud-kpi-value">{data.summary?.usersAffected ?? 0}</div>
        </div>
      </div>
    </HudPanel>

    <HudPanel title={$t('admin.errorsTableTitle')}>
      <div class="flex justify-end px-3 pt-2">
        <a href={`https://${data.sentryOrg}.sentry.io/issues/?project=${data.sentryProject}&query=is%3Aunresolved`}
          target="_blank" rel="noopener noreferrer" class="text-acc no-underline text-[12px]">{$t('admin.errorsOpenInSentry')}</a>
      </div>
      <AdminTableScroll>
        <table class="hud-table">
          <thead>
            <tr>
              <th scope="col" class="l">{$t('admin.colIssue')}</th>
              <th scope="col" class="l">{$t('admin.colLevel')}</th>
              <th scope="col" class="r">{$t('admin.colEvents')}</th>
              <th scope="col" class="r">{$t('admin.colUsers')}</th>
              <th scope="col" class="l">{$t('admin.colLastSeen')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.issues ?? [] as issue (issue.id)}
              <tr>
                <td>
                  <a href={issue.permalink} target="_blank" rel="noopener noreferrer" class="no-underline" style="color:#e7edf5;font-weight:500;">{issue.title}</a>
                  {#if issue.culprit}
                    <div class="dim" style="margin-top:2px;">{issue.culprit}</div>
                  {/if}
                </td>
                <td><AdminStatusBadge status={LEVEL_STATUS[issue.level] ?? 'warn'} /></td>
                <td class="num r dim">{issue.count.toLocaleString('en-US')}</td>
                <td class="num r dim">{issue.userCount.toLocaleString('en-US')}</td>
                <td class="dim nowrap">{new Date(issue.lastSeen).toLocaleString('en-GB')}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="empty">{$t('admin.errorsNone')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </HudPanel>
  {/if}

  <a href="/admin" class="text-[13px] text-acc no-underline">{$t('admin.backToOverview')}</a>

</div>
