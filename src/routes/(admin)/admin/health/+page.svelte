<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import AdminStatusBadge from '$lib/components/admin/AdminStatusBadge.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import Check from '@lucide/svelte/icons/check';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  let { data }: { data: PageData } = $props();

  const isOk = $derived(data.overallStatus === 'ok');

  const QUALITY_COLOR: Record<string, string> = {
    GREEN: 'var(--mep-pos)', YELLOW: 'var(--mep-warn)', RED: 'var(--mep-neg)',
  };

  type Severity = 'info' | 'warning' | 'critical';
  const SEVERITY_STATUS: Record<Severity, 'ok' | 'warn' | 'error'> = {
    info: 'ok', warning: 'warn', critical: 'error',
  };
</script>

<AdminPageHead route="/admin/health" title={$t('admin.systemHealth')} subtitle={$t('admin.healthSubtitle')} />

<div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:14px;">

  <div class="card" style="
    padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;
    background:{isOk ? 'var(--mep-pos-soft)' : 'var(--mep-neg-soft)'};
    border-color:{isOk ? 'var(--mep-pos-soft)' : 'var(--mep-neg-soft)'};
  ">
    <div style="display:flex;align-items:center;gap:16px;min-width:0;">
      <div style="
        width:44px;height:44px;border-radius:22px;flex-shrink:0;
        background:{isOk ? 'var(--mep-pos)' : 'var(--mep-neg)'};color:{isOk ? 'var(--mep-pos-fg)' : 'var(--mep-neg-fg)'};
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 0 6px {isOk ? 'var(--mep-pos-soft)' : 'var(--mep-neg-soft)'};
      ">
        {#if isOk}<Check size={22} />{:else}<AlertTriangle size={20} />{/if}
      </div>
      <div>
        <div class="num" style="font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:{isOk ? 'var(--mep-pos)' : 'var(--mep-neg)'};margin-bottom:4px;">
          {$t('admin.status')}
        </div>
        <div style="font-size:32px;font-weight:600;color:{isOk ? 'var(--mep-pos)' : 'var(--mep-neg)'};letter-spacing:-0.6px;line-height:1;">
          {data.overallStatus.toUpperCase()}
        </div>
      </div>
    </div>
    <div class="num" style="font-size:11.5px;color:var(--mep-fg-2);text-align:right;line-height:1.55;">
      {$ti('admin.checkedAt', { time: new Date(data.checkedAt).toLocaleString('en-GB') })}
    </div>
  </div>

  <SectionCard title={$t('admin.checksTitle')} noPad>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid var(--mep-divider);">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colCheck')}</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colStatus')}</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colDetail')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.checks as check}
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <td style="padding:9px 16px;font-weight:500;color:var(--mep-fg);">{check.name}</td>
            <td style="padding:9px 16px;text-align:center;"><AdminStatusBadge status={check.status} /></td>
            <td style="padding:9px 16px;color:var(--mep-fg-2);font-size:12px;">
              {check.detail}
              {#if check.href}
                <a href={check.href} style="color:var(--mep-acc);text-decoration:none;margin-left:6px;">{check.href}</a>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </SectionCard>

  {#if data.whatsapp}
    <div>
      <div class="label" style="margin-bottom:10px;">{$t('admin.wa.numberHealth')}</div>

      {#if !data.whatsapp.health.everReported}
        <div class="card" style="padding:14px 16px;font-size:13px;color:var(--mep-fg-2);">
          {$ti('admin.wa.noEvents', { fields: 'account_update / phone_number_quality_update' })}
        </div>
      {:else}
        <div class="card" style="padding:14px 16px;display:flex;gap:24px;flex-wrap:wrap;font-size:13px;">
          <div>
            <div class="label" style="margin-bottom:2px;">{$t('admin.wa.quality')}</div>
            <div style="font-weight:600;color:{QUALITY_COLOR[data.whatsapp.health.qualityRating ?? ''] ?? 'var(--mep-fg)'};">
              {data.whatsapp.health.qualityRating ?? 'unknown'}
            </div>
          </div>
          <div>
            <div class="label" style="margin-bottom:2px;">{$t('admin.wa.messagingLimit')}</div>
            <div style="font-weight:600;color:var(--mep-fg);">{data.whatsapp.health.messagingLimit ?? 'unknown'}</div>
          </div>
          <div>
            <div class="label" style="margin-bottom:2px;">{$t('admin.wa.worst30d')}</div>
            <div><AdminStatusBadge status={SEVERITY_STATUS[data.whatsapp.health.severity]} /></div>
          </div>
        </div>
      {/if}

      {#if data.whatsapp.events.length > 0}
        <div class="card" style="overflow:hidden;padding:0;margin-top:10px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:1px solid var(--mep-divider);">
                <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.colWhen')}</th>
                <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.colEvent')}</th>
                <th style="padding:8px 16px;text-align:center;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.colSeverity')}</th>
                <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.quality')}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.whatsapp.events as evt (evt.id)}
                <tr style="border-bottom:1px solid var(--mep-divider);">
                  <td style="padding:7px 16px;color:var(--mep-fg-2);font-size:12px;white-space:nowrap;">
                    {evt.receivedAt ? new Date(evt.receivedAt).toLocaleString('en-GB') : '—'}
                  </td>
                  <td style="padding:7px 16px;font-family:var(--mep-fs-mono);font-size:12px;color:var(--mep-fg);">
                    {evt.field}/{evt.event ?? 'unknown'}
                  </td>
                  <td style="padding:7px 16px;text-align:center;"><AdminStatusBadge status={SEVERITY_STATUS[evt.severity as Severity]} /></td>
                  <td style="padding:7px 16px;color:var(--mep-fg-2);font-size:12px;">{evt.qualityRating ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if data.whatsapp.tenants.length > 0}
        <div class="label" style="margin:16px 0 10px;">{$t('admin.wa.tenantSenders')}</div>
        <div class="card" style="overflow:hidden;padding:0;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tbody>
              {#each data.whatsapp.tenants as tenant (tenant.restaurantId)}
                <tr style="border-bottom:1px solid var(--mep-divider);">
                  <td style="padding:7px 16px;color:var(--mep-fg);">{tenant.name}</td>
                  <td style="padding:7px 16px;text-align:right;color:var(--mep-fg-2);" class="num">{tenant.contacts}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}

  {#if data.tableCounts.length > 0}
    <SectionCard title={$t('admin.tableRowCounts')} noPad>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--mep-divider);">
            <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colTable')}</th>
            <th style="padding:8px 16px;text-align:right;font-size:11px;font-weight:600;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colRowsEst')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.tableCounts as row}
            <tr style="border-bottom:1px solid var(--mep-divider);">
              <td style="padding:7px 16px;font-family:var(--mep-fs-mono);font-size:12px;color:var(--mep-fg-2);">{row.table}</td>
              <td style="padding:7px 16px;text-align:right;color:var(--mep-fg);" class="num">{row.rows.toLocaleString('en-US')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </SectionCard>
  {/if}

  <a href="/admin" style="font-size:13px;color:var(--mep-acc);text-decoration:none;">{$t('admin.backToOverview')}</a>

</div>
