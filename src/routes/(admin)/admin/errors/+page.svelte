<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminStatusBadge from '$lib/components/admin/AdminStatusBadge.svelte';
  import AdminKpiCard from '$lib/components/admin/AdminKpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';
  let { data }: { data: PageData } = $props();

  const LEVEL_STATUS: Record<string, 'ok' | 'warn' | 'error'> = {
    fatal: 'error', error: 'error', warning: 'warn', info: 'ok', debug: 'ok',
  };
</script>

<AdminPageHead route="/admin/errors" title={$t('admin.errors')} subtitle={$t('admin.errorsSubtitle')} />

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:14px;">

  {#if !data.configured}
    <div class="card" style="padding:14px 16px;font-size:13px;color:var(--mep-fg-2);">
      {$t('admin.errorsNotConfigured')}
    </div>
  {:else}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;">
      <AdminKpiCard label={$t('admin.errorsUnresolved')} value={data.summary?.unresolvedCount ?? 0}
        valueColor={(data.summary?.unresolvedCount ?? 0) > 0 ? 'text-warn' : 'text-fg'} />
      <AdminKpiCard label={$t('admin.errorsCritical')} value={data.summary?.criticalCount ?? 0}
        valueColor={(data.summary?.criticalCount ?? 0) > 0 ? 'text-neg' : 'text-fg'} />
      <AdminKpiCard label={$t('admin.errorsUsersAffected')} value={data.summary?.usersAffected ?? 0} />
    </div>

    <SectionCard title={$t('admin.errorsTableTitle')} noPad
      href={`https://${data.sentryOrg}.sentry.io/issues/?project=${data.sentryProject}&query=is%3Aunresolved`}
      actionLabel={$t('admin.errorsOpenInSentry')}>
      <AdminTableScroll>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colIssue')}</th>
              <th scope="col" style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colLevel')}</th>
              <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colEvents')}</th>
              <th scope="col" style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colUsers')}</th>
              <th scope="col" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colLastSeen')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.issues ?? [] as issue (issue.id)}
              <tr style="border-bottom:1px solid var(--mep-divider);">
                <td style="padding:9px 16px;">
                  <a href={issue.permalink} target="_blank" rel="noopener noreferrer"
                    style="color:var(--mep-fg);text-decoration:none;font-weight:500;">{issue.title}</a>
                  {#if issue.culprit}
                    <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:2px;">{issue.culprit}</div>
                  {/if}
                </td>
                <td style="padding:9px 16px;text-align:center;"><AdminStatusBadge status={LEVEL_STATUS[issue.level] ?? 'warn'} /></td>
                <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{issue.count.toLocaleString('en-US')}</td>
                <td style="padding:9px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{issue.userCount.toLocaleString('en-US')}</td>
                <td style="padding:9px 16px;color:var(--mep-fg-2);font-size:12px;white-space:nowrap;">{new Date(issue.lastSeen).toLocaleString('en-GB')}</td>
              </tr>
            {:else}
              <tr><td colspan="5" style="padding:16px;text-align:center;color:var(--mep-fg-3);">{$t('admin.errorsNone')}</td></tr>
            {/each}
          </tbody>
        </table>
      </AdminTableScroll>
    </SectionCard>
  {/if}

  <a href="/admin" style="font-size:13px;color:var(--mep-acc);text-decoration:none;">{$t('admin.backToOverview')}</a>

</div>
