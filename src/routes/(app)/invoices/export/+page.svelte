<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="flex items-start justify-center p-6">
  <div class="w-full max-w-[520px]">
    <SectionCard title={$t('export.title')}>
      {#snippet headerRight()}
        <a href="/invoices" class="btn btn-ghost" style="height:28px;font-size:12px;text-decoration:none;">
          {$t('export.backLabel')}
        </a>
      {/snippet}

      <form method="GET" action="/invoices/export/download" class="flex flex-col gap-4">

        <div class="flex flex-col gap-1">
          <label class="label" for="date_from">{$t('export.dateRange')}</label>
          <div class="flex gap-2 items-center">
            <input id="date_from" type="date" name="date_from" class="input flex-1" style="height:36px;font-size:13px;" />
            <span class="body text-fg-3">→</span>
            <input type="date" name="date_to" class="input flex-1" style="height:36px;font-size:13px;" />
          </div>
          <p class="body text-fg-3" style="font-size:11.5px;">{$t('export.dateHint')}</p>
        </div>

        <div class="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
          <div class="flex flex-col gap-1">
            <label class="label" for="supplier_id">{$t('inv.filter.supplier')}</label>
            <select id="supplier_id" name="supplier_id" class="input" style="height:36px;font-size:13px;padding:0 8px;">
              <option value="">{$t('inv.filter.all')}</option>
              {#each data.suppliers as s (s.id)}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <span class="label">{$t('export.status')}</span>
            <div class="flex gap-4 items-center h-9">
              {#each [['', $t('export.allStatus')], ['paid', $t('export.paid')], ['pending', $t('export.pending')]] as [val, lbl]}
                <label class="flex items-center gap-1.5 body cursor-pointer" style="font-size:13px;">
                  <input type="radio" name="status" value={val} checked={val === ''} class="accent-acc" />
                  {lbl}
                </label>
              {/each}
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-1">
          <a href="/invoices" class="btn btn-secondary" style="height:36px;text-decoration:none;">{$t('export.cancel')}</a>
          <button type="submit" class="btn btn-primary" style="height:36px;">{$t('export.download')}</button>
        </div>

      </form>
    </SectionCard>
  </div>
</div>
