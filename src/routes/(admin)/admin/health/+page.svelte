<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  let { data }: { data: PageData } = $props();

  const STATUS_COLOR: Record<string, string> = {
    ok:    '#16a34a',
    warn:  '#d97706',
    error: '#dc2626',
  };

  const STATUS_LABEL: Record<string, string> = {
    ok: 'OK', warn: 'WARN', error: 'ERR',
  };

  type Severity = 'info' | 'warning' | 'critical';
  const SEVERITY_STATUS: Record<Severity, string> = {
    info: 'ok', warning: 'warn', critical: 'error',
  };

  const QUALITY_COLOR: Record<string, string> = {
    GREEN: '#16a34a', YELLOW: '#d97706', RED: '#dc2626',
  };
</script>

<div style="padding:28px 32px;max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:20px;">

  <div style="display:flex;align-items:center;gap:12px;">
    <h2 style="margin:0;font-size:22px;font-weight:600;color:#111;letter-spacing:-0.3px;">{$t('admin.systemHealth')}</h2>
    <span style="
      padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;
      background:{STATUS_COLOR[data.overallStatus]}22;
      color:{STATUS_COLOR[data.overallStatus]};
    ">{STATUS_LABEL[data.overallStatus]}</span>
    <span style="font-size:12px;color:#aaa;margin-left:auto;">
      {$ti('admin.checkedAt', { time: new Date(data.checkedAt).toLocaleString('en-GB') })}
    </span>
  </div>

  <div class="card" style="overflow:hidden;padding:0;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colCheck')}</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colStatus')}</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colDetail')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.checks as check}
          <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
            <td style="padding:9px 16px;font-weight:500;color:#111;">{check.name}</td>
            <td style="padding:9px 16px;text-align:center;">
              <span style="
                display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;
                background:{STATUS_COLOR[check.status]}22;color:{STATUS_COLOR[check.status]};
              ">{STATUS_LABEL[check.status]}</span>
            </td>
            <td style="padding:9px 16px;color:#555;font-size:12px;">{check.detail}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if data.whatsapp}
    <section>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
        {$t('admin.wa.numberHealth')}
      </div>

      {#if !data.whatsapp.health.everReported}
        <div class="card" style="padding:14px 16px;font-size:13px;color:#555;">
          {$ti('admin.wa.noEvents', { fields: 'account_update / phone_number_quality_update' })}
        </div>
      {:else}
        <div class="card" style="padding:14px 16px;display:flex;gap:24px;flex-wrap:wrap;font-size:13px;">
          <div>
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.quality')}</div>
            <div style="font-weight:600;color:{QUALITY_COLOR[data.whatsapp.health.qualityRating ?? ''] ?? '#111'};">
              {data.whatsapp.health.qualityRating ?? 'unknown'}
            </div>
          </div>
          <div>
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.messagingLimit')}</div>
            <div style="font-weight:600;color:#111;">{data.whatsapp.health.messagingLimit ?? 'unknown'}</div>
          </div>
          <div>
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.worst30d')}</div>
            <div style="font-weight:600;color:{STATUS_COLOR[SEVERITY_STATUS[data.whatsapp.health.severity]]};">
              {data.whatsapp.health.lastEvent ?? '—'}
            </div>
          </div>
        </div>
      {/if}

      {#if data.whatsapp.events.length > 0}
        <div class="card" style="overflow:hidden;padding:0;margin-top:10px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
                <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.colWhen')}</th>
                <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.colEvent')}</th>
                <th style="padding:8px 16px;text-align:center;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.colSeverity')}</th>
                <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.wa.quality')}</th>
              </tr>
            </thead>
            <tbody>
              {#each data.whatsapp.events as evt (evt.id)}
                <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
                  <td style="padding:7px 16px;color:#555;font-size:12px;white-space:nowrap;">
                    {evt.receivedAt ? new Date(evt.receivedAt).toLocaleString('en-GB') : '—'}
                  </td>
                  <td style="padding:7px 16px;font-family:monospace;font-size:12px;color:#111;">
                    {evt.field}/{evt.event ?? 'unknown'}
                  </td>
                  <td style="padding:7px 16px;text-align:center;">
                    <span style="
                      display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;
                      background:{STATUS_COLOR[SEVERITY_STATUS[evt.severity as Severity]]}22;
                      color:{STATUS_COLOR[SEVERITY_STATUS[evt.severity as Severity]]};
                    ">{STATUS_LABEL[SEVERITY_STATUS[evt.severity as Severity]]}</span>
                  </td>
                  <td style="padding:7px 16px;color:#555;font-size:12px;">{evt.qualityRating ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if data.whatsapp.tenants.length > 0}
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin:16px 0 10px;">
          {$t('admin.wa.tenantSenders')}
        </div>
        <div class="card" style="overflow:hidden;padding:0;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tbody>
              {#each data.whatsapp.tenants as tenant (tenant.restaurantId)}
                <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
                  <td style="padding:7px 16px;color:#111;">{tenant.name}</td>
                  <td style="padding:7px 16px;text-align:right;color:#555;" class="num">{tenant.contacts}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}

  {#if data.tableCounts.length > 0}
    <section>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin-bottom:10px;">
        {$t('admin.tableRowCounts')}
      </div>
      <div class="card" style="overflow:hidden;padding:0;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
              <th style="padding:8px 16px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colTable')}</th>
              <th style="padding:8px 16px;text-align:right;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">{$t('admin.colRowsEst')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.tableCounts as t}
              <tr style="border-bottom:1px solid var(--mep-divider,#e5e5e5);">
                <td style="padding:7px 16px;font-family:monospace;font-size:12px;color:#555;">{t.table}</td>
                <td style="padding:7px 16px;text-align:right;color:#111;" class="num">{t.rows.toLocaleString('en-US')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <a href="/admin" style="font-size:13px;color:#dc2626;text-decoration:none;">{$t('admin.backToOverview')}</a>

</div>
