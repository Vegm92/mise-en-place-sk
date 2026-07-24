<script lang="ts">
  import type { PageData } from './$types';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data }: { data: PageData } = $props();

  let deleteConfirm = $state('');
  let deleting = $state(false);
  let deleteError = $state('');

  async function handleDeleteAccount() {
    const tFn = get(t);
    if (deleteConfirm !== tFn('set.deleteConfirmWord')) return;
    deleting = true;
    deleteError = '';
    try {
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }),
      });
      if (res.ok) {
        window.location.href = '/login';
      } else {
        const body = await res.json().catch(() => ({}));
        deleteError = body.message ?? tFn('set.deleteErrorGeneric');
      }
    } catch {
      deleteError = tFn('set.deleteErrorNetwork');
    } finally {
      deleting = false;
    }
  }
</script>

<div class="p-6 flex justify-center">
  <div class="w-full max-w-[440px] flex flex-col gap-4">

    <div class="card p-4">
      <p class="body text-fg-2" style="font-size:13px;">{$t('set.currency')}</p>
    </div>

    <SectionCard title={$t('set.thresholdTitle')}>
      <form method="post" action="?/saveThreshold" class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <input type="number" name="value" min="1" max="99" value={data.threshold}
            class="input w-[90px]" style="height:36px;font-size:13px;" />
          <span class="body text-fg-2" style="font-size:13px;">%</span>
          <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.save')}</button>
        </div>
        <p class="body text-fg-3" style="font-size:12px;">{$t('set.thresholdDesc')}</p>
      </form>
    </SectionCard>

    <SectionCard title={$t('set.priceThresholdTitle')}>
      <form method="post" action="?/savePriceThreshold" class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <input type="number" name="value" min="1" max="99" value={data.priceThreshold}
            class="input w-[90px]" style="height:36px;font-size:13px;" />
          <span class="body text-fg-2" style="font-size:13px;">%</span>
          <button type="submit" class="btn btn-primary" style="height:36px;">{$t('set.save')}</button>
        </div>
        <p class="body text-fg-3" style="font-size:12px;">{$t('set.priceThresholdDesc')}</p>
      </form>
    </SectionCard>

    <div data-coach="settings-main">
      <SectionCard title={$t('set.tourTitle')}>
        <p class="body text-fg-2" style="font-size:13px;margin:0 0 12px;">
          {$t('set.tourDesc')}
        </p>
        <form method="POST" action="?/resetTutorial">
          <button type="submit" class="btn btn-secondary" style="height:34px;font-size:13px;">
            {$t('set.tourRepeat')}
          </button>
        </form>
      </SectionCard>
    </div>

    <SectionCard title={$t('set.privacyTitle')}>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <p class="body text-fg-2" style="font-size:13px;margin:0 0 8px;">
            {$t('set.dataExportDesc')}
          </p>
          <a href="/api/user/export" download class="btn btn-secondary" style="height:34px;font-size:13px;text-decoration:none;display:inline-flex;align-items:center;">
            {$t('set.dataExportBtn')}
          </a>
        </div>

        <hr style="border:none;border-top:1px solid var(--mep-divider);margin:4px 0;" />

        <div>
          <p class="body text-fg-2" style="font-size:13px;margin:0 0 4px;">
            {$t('set.deleteDesc')}
          </p>
          <p class="body text-fg-3" style="font-size:12px;margin:0 0 10px;">
            {$t('set.deleteType')} <strong>{$t('set.deleteConfirmWord')}</strong> {$t('set.deleteHint')}
          </p>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input
              type="text"
              placeholder={$t('set.deleteConfirmWord')}
              bind:value={deleteConfirm}
              class="input"
              style="height:34px;font-size:13px;width:140px;"
            />
            <button
              type="button"
              onclick={handleDeleteAccount}
              disabled={deleteConfirm !== $t('set.deleteConfirmWord') || deleting}
              class="btn"
              style="height:34px;font-size:13px;background:var(--mep-danger,#c0392b);color:#fff;border:none;opacity:{deleteConfirm !== $t('set.deleteConfirmWord') || deleting ? 0.5 : 1};"
            >
              {deleting ? $t('set.deletingBtn') : $t('set.deleteBtn')}
            </button>
          </div>
          {#if deleteError}
            <p style="font-size:12px;color:var(--mep-danger,#c0392b);margin:6px 0 0;">{deleteError}</p>
          {/if}
        </div>

        <div style="display:flex;gap:12px;margin-top:4px;">
          <a href="/privacy" style="font-size:12px;color:var(--mep-fg-3);">{$t('set.privacyLink')}</a>
          <a href="/terms"   style="font-size:12px;color:var(--mep-fg-3);">{$t('set.termsLink')}</a>
        </div>
      </div>
    </SectionCard>

  </div>
</div>
