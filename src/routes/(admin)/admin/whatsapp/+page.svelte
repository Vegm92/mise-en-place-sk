<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data }: { data: PageData } = $props();

  const STATUS_COLOR: Record<string, string> = {
    ready:        'var(--mep-pos)',
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
      <p style="font-size:12.5px;color:var(--mep-fg-2);margin:0;">
        {$t('admin.whatsapp.notConfiguredBody')}
      </p>
    </SectionCard>
  {/if}

  <SectionCard title={$t('admin.whatsapp.killSwitch')}>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <p style="font-size:12.5px;color:var(--mep-fg-2);margin:0;max-width:60ch;">
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
      <p style="font-size:12.5px;color:var(--mep-fg-2);margin:0 0 12px;max-width:60ch;">
        {$t('admin.whatsapp.pairingBody')}
      </p>
      <div style="width:220px;background:#fff;padding:12px;border-radius:6px;">
        {@html data.qrSvg}
      </div>
    {:else}
      <p style="font-size:12.5px;color:var(--mep-fg-2);margin:0;">
        {$t('admin.whatsapp.noQr')}
      </p>
    {/if}
  </SectionCard>

</div>
