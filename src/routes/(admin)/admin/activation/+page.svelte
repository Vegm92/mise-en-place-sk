<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import { fmtMinutes, fmtPercent } from '$lib/formatters';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';

  let { data }: { data: PageData } = $props();

  const ttv = $derived(data.timeToValue);
  const retention = $derived(data.weekFourRetention);
</script>

<AdminPageHead
  route="/admin/activation"
  title={t('admin.activation.title')}
/>

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">
  <div class="hud-grid hud-grid-2">
    <HudPanel title={t('admin.activation.ttv.title')} sub={ti('admin.activation.ttv.sub', { n: ttv.sampleSize })}>
      {#if ttv.sampleSize === 0}
        <div class="empty">{t('admin.activation.empty')}</div>
      {:else}
        <div class="hud-kpi-row">
          <div class="hud-kpi">
            <span class="hud-kpi-label">{t('admin.activation.ttv.title')}</span>
            <span class="hud-kpi-value">{fmtMinutes(ttv.medianMinutes)} / {fmtMinutes(ttv.p90Minutes)}</span>
          </div>
        </div>
      {/if}
    </HudPanel>

    <HudPanel title={t('admin.activation.retention.title')} sub={ti('admin.activation.retention.sub', { n: retention.cohortSize })}>
      {#if retention.cohortSize === 0}
        <div class="empty">{t('admin.activation.empty')}</div>
      {:else}
        <div class="hud-kpi-row">
          <div class="hud-kpi">
            <span class="hud-kpi-label">{t('admin.activation.retention.title')}</span>
            <span class="hud-kpi-value">{fmtPercent(retention.retentionRate)}</span>
          </div>
        </div>
      {/if}
    </HudPanel>
  </div>
</div>

<style>
  .empty {
    padding: 16px 12px;
    font: 500 12px/1.4 ui-monospace, monospace;
    color: #5b6472;
  }
</style>
