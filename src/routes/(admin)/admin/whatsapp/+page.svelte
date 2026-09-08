<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const RELEASE_ERRORS: Record<string, string> = {
    invalid:  'admin.whatsapp.releaseErr.invalid',
    notFound: 'admin.whatsapp.releaseErr.notFound',
  };

  const STATUS_COLOR: Record<string, string> = {
    ready:        'var(--mep-pos)',
    connecting:   'var(--mep-fg-2)',
    unreachable:  'var(--mep-neg)',
    pairing:      'var(--mep-warn)',
    reconnecting: 'var(--mep-warn)',
    logged_out:   'var(--mep-neg)',
    unknown:      'var(--mep-fg-3)',
  };
  const statusColor = $derived(STATUS_COLOR[data.status] ?? 'var(--mep-fg-3)');
</script>

<AdminPageHead
  route="/admin/whatsapp"
  title={t('admin.whatsapp.title')}
  subtitle={t('admin.whatsapp.subtitle')}
>
  {#snippet right()}
    <span style="font-size:13px;color:{statusColor};">
      {t(`admin.whatsapp.status.${data.status}`)}
    </span>
  {/snippet}
</AdminPageHead>

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  {#if !data.configured}
    <HudPanel title={t('admin.whatsapp.notConfigured')}>
      <p class="m-0 p-3 text-[13px]" style="color:#5b6472;">
        {t('admin.whatsapp.notConfiguredBody')}
      </p>
    </HudPanel>
  {/if}

  <HudPanel title={t('admin.whatsapp.killSwitch')}>
    <div class="p-3 flex items-center justify-between gap-4 flex-wrap">
      <p class="m-0 text-[13px] max-w-[60ch]" style="color:#5b6472;">
        {t('admin.whatsapp.killSwitchBody')}
      </p>
      <form method="POST" action="?/toggleBot">
        <input type="hidden" name="enabled" value={data.enabled ? 'false' : 'true'} />
        <button class="btn {data.enabled ? 'btn-secondary' : 'btn-primary'}" type="submit">
          {data.enabled ? t('admin.whatsapp.stop') : t('admin.whatsapp.start')}
        </button>
      </form>
    </div>
  </HudPanel>

  <HudPanel title={t('admin.whatsapp.pairing')}>
    <div class="p-3">
      {#if data.qrSvg}
        <p class="m-0 mb-3 text-[13px] max-w-[60ch]" style="color:#5b6472;">
          {t('admin.whatsapp.pairingBody')}
        </p>
        <div style="width:220px;background:#fff;padding:12px;border-radius:6px;">
          {@html data.qrSvg}
        </div>
      {:else}
        <p class="m-0 text-[13px]" style="color:#5b6472;">
          {t('admin.whatsapp.noQr')}
        </p>
      {/if}
    </div>
  </HudPanel>

  <HudPanel title={t('admin.whatsapp.release')}>
    <div class="p-3">
      <p class="m-0 mb-3 text-[13px] max-w-[60ch]" style="color:#5b6472;">
        {t('admin.whatsapp.releaseBody')}
      </p>
      <form method="POST" action="?/releaseContact" use:enhance class="flex gap-2 flex-wrap">
        <input name="phone" type="tel" required
          placeholder={t('admin.whatsapp.releasePlaceholder')} class="input flex-1 min-w-[200px]" />
        <button type="submit" class="btn btn-secondary">{t('admin.whatsapp.releaseButton')}</button>
      </form>
      {#if form?.released}
        <p class="text-[13px] mt-2" style="color:#34d399;">{t('admin.whatsapp.releaseOk')}</p>
      {:else if form?.error && RELEASE_ERRORS[form.error]}
        <p class="text-[13px] mt-2" style="color:#f87171;">{t(RELEASE_ERRORS[form.error] ?? '')}</p>
      {/if}
    </div>
  </HudPanel>

</div>
