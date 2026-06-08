<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data }: { data: PageData } = $props();
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

    <SectionCard title="Tour guiado">
      <p class="body text-fg-2" style="font-size:13px;margin:0 0 12px;">
        Repasa el tutorial de inicio en cualquier momento.
      </p>
      <form method="POST" action="?/resetTutorial">
        <button type="submit" class="btn btn-secondary" style="height:34px;font-size:13px;">
          Repetir tour →
        </button>
      </form>
    </SectionCard>

  </div>
</div>
