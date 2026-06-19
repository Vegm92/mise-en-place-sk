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

  <!-- Checks -->
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

  <!-- Table row counts -->
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
