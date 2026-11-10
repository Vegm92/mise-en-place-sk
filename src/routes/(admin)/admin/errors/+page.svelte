<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  let { data }: { data: PageData } = $props();
</script>

<AdminPageHead route="/admin/errors" title={t('admin.errors')} subtitle={t('admin.errorsSubtitle')} />

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  <HudPanel title={t('admin.errors')}>
    <div class="p-3 text-[13px]" style="color:#5b6472;">
      {#if data.sentryUrl}
        <p class="m-0 mb-3 max-w-[60ch]">{t('admin.errorsInSentryBody')}</p>
        <a href={data.sentryUrl} target="_blank" rel="noopener noreferrer" class="btn btn-primary">{t('admin.errorsOpenInSentry')}</a>
      {:else}
        <p class="m-0">{t('admin.errorsNotConfigured')}</p>
      {/if}
    </div>
  </HudPanel>

  <a href="/admin" class="text-[13px] text-acc no-underline">{t('admin.backToOverview')}</a>

</div>
