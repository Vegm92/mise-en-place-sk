<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="p-6 flex justify-center">
  <div class="w-full max-w-[520px]">
    <SectionCard title={$t('nav.budgets')} sub={$t('bud.monthlyTitle')}>
      <form method="post" action="?/save" class="flex flex-col">
        {#each data.categories as category}
          <div class="flex items-center gap-4 py-3 border-b border-divider last:border-0">
            <span class="flex-1 body-strong" style="font-size:13px;">{category}</span>
            <div class="flex items-center gap-2">
              <span class="body text-fg-3" style="font-size:13px;">€</span>
              <input type="number" step="0.01" min="0"
                placeholder={$t('bud.noLimit')}
                name={category}
                value={data.budgets[category] ?? ''}
                class="input w-[130px]"
                style="height:36px;font-size:13px;" />
            </div>
          </div>
        {/each}
        <div class="mt-4">
          <button type="submit" class="btn btn-primary" style="height:36px;">{$t('bud.save')}</button>
        </div>
      </form>
    </SectionCard>
  </div>
</div>
