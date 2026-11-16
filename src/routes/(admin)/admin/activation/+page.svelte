<script lang="ts">
  import type { PageData } from './$types';
  import { locale, t, ti } from '$lib/i18n';
  import { fmtDateShort, fmtMinutes, fmtPercent } from '$lib/formatters';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';

  let { data }: { data: PageData } = $props();

  const ttv = $derived(data.timeToValue);
  const retention = $derived(data.weekFourRetention);
  const f = $derived(data.funnel);
  const tti = $derived(data.funnel.timeToInsight);
</script>

<AdminPageHead
  route="/admin/activation"
  title={t('admin.activation.title')}
/>

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">
  <HudPanel title={t('admin.activation.funnel.title')} sub={ti('admin.activation.funnel.sub', { n: f.excludedInternal })}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col">{t('admin.activation.col.step')}</th>
            <th scope="col" class="r">{t('admin.activation.col.restaurants')}</th>
            <th scope="col" class="r">{t('admin.activation.col.conversion')}</th>
            <th scope="col" class="w45">{t('admin.activation.col.ofSignups')}</th>
          </tr>
        </thead>
        <tbody>
          {#each f.steps as step}
            <tr>
              <td class="dim nowrap">{t('admin.activation.funnel.' + step.key)}</td>
              <td class="num r">{step.count}</td>
              <td class="num r dim nowrap">
                {step.rate === null ? '—' : fmtPercent(step.rate)}
                {#if step.rate !== null}<span class="note">{ti('admin.activation.ofN', { count: step.count, n: step.base })}</span>{/if}
              </td>
              <td><div class="hud-bar-track" style="width:{step.share * 100}%"></div></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <HudPanel title={t('admin.activation.tti.title')} sub={ti('admin.activation.tti.sub', { n: tti.sampleSize })}>
    <div class="hud-kpi-row">
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.activation.tti.median')}</span>
        <span class="hud-kpi-value">{fmtMinutes(tti.medianMinutes)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.activation.tti.p75')}</span>
        <span class="hud-kpi-value">{fmtMinutes(tti.p75Minutes)}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{ti('admin.activation.tti.within', { n: f.targetMinutes })}</span>
        <span class="hud-kpi-value">{fmtPercent(tti.withinTargetRate)}</span>
        <span class="note">{ti('admin.activation.ofN', { count: tti.withinTarget, n: tti.targetBase })}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.activation.activation')}</span>
        <span class="hud-kpi-value">{fmtPercent(f.activation.rate)}</span>
        <span class="note">{ti('admin.activation.ofN', { count: f.activation.count, n: f.activation.eligible })}</span>
      </div>
      <div class="hud-kpi">
        <span class="hud-kpi-label">{t('admin.activation.weekFour')}</span>
        <span class="hud-kpi-value">{fmtPercent(f.weekFour.rate)}</span>
        <span class="note">{ti('admin.activation.ofN', { count: f.weekFour.count, n: f.weekFour.eligible })}</span>
      </div>
    </div>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col">{t('admin.activation.col.toInsight')}</th>
            <th scope="col" class="r">{t('admin.activation.col.restaurants')}</th>
            <th scope="col" class="w45">{ti('admin.activation.col.ofUploaders', { n: tti.uploaders })}</th>
          </tr>
        </thead>
        <tbody>
          {#each tti.buckets as bucket}
            <tr>
              <td class="dim nowrap">{t('admin.activation.tti.bucket.' + bucket.key)}</td>
              <td class="num r">{bucket.count}</td>
              <td><div class="hud-bar-track" style="width:{bucket.share * 100}%"></div></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <HudPanel title={t('admin.activation.cohorts.title')} sub={t('admin.activation.cohorts.sub')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col">{t('admin.activation.col.week')}</th>
            <th scope="col" class="r">{t('admin.activation.col.signups')}</th>
            <th scope="col" class="r">{t('admin.activation.col.activated')}</th>
            <th scope="col" class="r">{t('admin.activation.col.weekFourActive')}</th>
            <th scope="col" class="r">{t('admin.activation.col.weekFourRate')}</th>
          </tr>
        </thead>
        <tbody>
          {#each f.cohorts as cohort}
            <tr>
              <td class="mono nowrap">{cohort.week}</td>
              <td class="num r">{cohort.signups}</td>
              <td class="num r dim">{cohort.activated}</td>
              <td class="num r dim">{ti('admin.activation.ofN', { count: cohort.weekFour.count, n: cohort.weekFour.eligible })}</td>
              <td class="num r">{fmtPercent(cohort.weekFour.rate)}</td>
            </tr>
          {:else}
            <tr><td colspan="5" class="empty">{t('admin.activation.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

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

  <HudPanel title={t('admin.activation.restaurants.title')} sub={t('admin.activation.restaurants.sub')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col">{t('admin.activation.col.restaurant')}</th>
            <th scope="col" class="r">{t('admin.activation.col.signupAt')}</th>
            <th scope="col" class="r">{t('admin.activation.col.toUpload')}</th>
            <th scope="col" class="r">{t('admin.activation.col.toExtracted')}</th>
            <th scope="col" class="r">{t('admin.activation.col.toInsight')}</th>
            <th scope="col" class="r">{t('admin.activation.col.activated')}</th>
            <th scope="col" class="r">{t('admin.activation.col.weekFour')}</th>
          </tr>
        </thead>
        <tbody>
          {#each f.restaurants as r (r.id)}
            <tr>
              <td class="nowrap">{r.name}</td>
              <td class="num r dim nowrap">{fmtDateShort(r.signupAt, locale.current)}</td>
              <td class="num r dim nowrap">{fmtMinutes(r.minutesToUpload)}</td>
              <td class="num r dim nowrap">{fmtMinutes(r.minutesToExtracted)}</td>
              <td class="num r nowrap">{fmtMinutes(r.minutesToInsight)}</td>
              <td class="r" class:good={r.activated} class:dim={!r.activated}>
                {r.activated ? t('admin.activation.yes') : t('admin.activation.no')}
              </td>
              {#if r.weekFour === 'active'}
                <td class="r good nowrap">{t('admin.activation.w4.active')}</td>
              {:else if r.weekFour === 'inactive'}
                <td class="r bad nowrap">{t('admin.activation.w4.inactive')}</td>
              {:else}
                <td class="r dim nowrap">{t('admin.activation.w4.pending')}</td>
              {/if}
            </tr>
          {:else}
            <tr><td colspan="7" class="empty">{t('admin.activation.empty')}</td></tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

  <p class="definitions">{t('admin.activation.definitions')}</p>
</div>

<style>
  .empty {
    padding: 16px 12px;
    font: 500 12px/1.4 ui-monospace, monospace;
    color: #5b6472;
  }

  .note {
    margin-left: 6px;
    font: 500 10px/1.2 ui-monospace, monospace;
    color: #5b6472;
  }

  .hud-kpi .note {
    margin-left: 0;
  }

  .definitions {
    font: 500 11px/1.5 ui-monospace, monospace;
    color: #5b6472;
    max-width: 90ch;
  }
</style>
