<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';

  const { data }: { data: PageData } = $props();
</script>

<div class="flex items-start justify-center p-6">
  <div class="w-full max-w-[520px] flex flex-col gap-4">

    <!-- Success card -->
    <div class="card p-8 text-center">
      <div class="text-4xl mb-3">✅</div>
      <h2 class="body-strong mb-2" style="font-size:16px;">{$t('saved.title')}</h2>
      <p class="body text-fg-2" style="font-size:13px;">
        {$t('saved.desc').replace('{id}', String(data.invoiceId))}
      </p>
    </div>

    <!-- Alerts -->
    {#if data.alerts.length > 0}
      <div class="card p-5 flex flex-col gap-3">
        <h2 class="body-strong" style="font-size:14px;">{$t('saved.alerts')}</h2>
        <div class="flex flex-col gap-2">
          {#each data.alerts as alert}
            <div class="card p-3 bg-warn-soft border-warn text-warn" style="font-size:13px;">{alert.message}</div>
          {/each}
        </div>
        <p class="body text-fg-3" style="font-size:12px;">{$t('saved.whatsapp')}</p>
      </div>
    {:else}
      <div class="card p-3 bg-info-soft border-info text-info" style="font-size:13px;">
        {$t('saved.noAlerts')}
      </div>
    {/if}

    <!-- CTA row -->
    <div class="flex gap-3">
      <a href="/invoices" class="btn btn-primary" style="height:36px;text-decoration:none;">{$t('saved.goInvoices')}</a>
      <a href="/" class="btn btn-secondary" style="height:36px;text-decoration:none;">{$t('saved.uploadAnother')}</a>
    </div>

  </div>
</div>
