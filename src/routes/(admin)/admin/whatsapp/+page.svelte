<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

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
  title={$t('admin.whatsapp.title')}
  subtitle={$t('admin.whatsapp.subtitle')}
>
  {#snippet right()}
    <span style="font-size:13px;color:{statusColor};">
      {$t(`admin.whatsapp.status.${data.status}`)}
    </span>
  {/snippet}
</AdminPageHead>

<div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:16px;">

  {#if !data.configured}
    <SectionCard title={$t('admin.whatsapp.notConfigured')}>
      <p style="font-size:13px;color:var(--mep-fg-2);margin:0;">
        {$t('admin.whatsapp.notConfiguredBody')}
      </p>
    </SectionCard>
  {/if}

  <SectionCard title={$t('admin.whatsapp.killSwitch')}>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <p style="font-size:13px;color:var(--mep-fg-2);margin:0;max-width:60ch;">
        {$t('admin.whatsapp.killSwitchBody')}
      </p>
      <form method="POST" action="?/toggleBot">
        <input type="hidden" name="enabled" value={data.enabled ? 'false' : 'true'} />
        <button class="btn {data.enabled ? 'btn-secondary' : 'btn-primary'}" type="submit">
          {data.enabled ? $t('admin.whatsapp.stop') : $t('admin.whatsapp.start')}
        </button>
      </form>
    </div>
  </SectionCard>

  <SectionCard title={$t('admin.whatsapp.pairing')}>
    {#if data.qrSvg}
      <p style="font-size:13px;color:var(--mep-fg-2);margin:0 0 12px;max-width:60ch;">
        {$t('admin.whatsapp.pairingBody')}
      </p>
      <div style="width:220px;background:#fff;padding:12px;border-radius:6px;">
        {@html data.qrSvg}
      </div>
    {:else}
      <p style="font-size:13px;color:var(--mep-fg-2);margin:0;">
        {$t('admin.whatsapp.noQr')}
      </p>
    {/if}
  </SectionCard>

  <SectionCard title={$t('admin.whatsapp.release')}>
    <p style="font-size:13px;color:var(--mep-fg-2);margin:0 0 12px;max-width:60ch;">
      {$t('admin.whatsapp.releaseBody')}
    </p>
    <form method="POST" action="?/releaseContact" use:enhance style="display:flex;gap:8px;flex-wrap:wrap;">
      <input name="phone" type="tel" required
        placeholder={$t('admin.whatsapp.releasePlaceholder')} class="input" style="flex:1;min-width:200px;" />
      <button type="submit" class="btn btn-secondary">{$t('admin.whatsapp.releaseButton')}</button>
    </form>
    {#if form?.released}
      <p style="font-size:13px;color:var(--mep-pos);margin:8px 0 0;">{$t('admin.whatsapp.releaseOk')}</p>
    {:else if form?.error && RELEASE_ERRORS[form.error]}
      <p style="font-size:13px;color:var(--mep-neg);margin:8px 0 0;">{$t(RELEASE_ERRORS[form.error])}</p>
    {/if}
  </SectionCard>

</div>
