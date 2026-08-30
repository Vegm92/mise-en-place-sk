<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AdminPageHead route="/admin/feature-flags" title={$t('admin.featureFlags.title')} subtitle={$t('admin.featureFlags.subtitle')} />

<div class="px-3 md:px-6" style="padding-bottom:24px;display:flex;flex-direction:column;gap:14px;">

  {#if form?.error}
    <div class="card" style="padding:12px 16px;font-size:13px;color:var(--mep-neg);background:var(--mep-neg-soft);border-color:var(--mep-neg-soft);">
      {$t('admin.featureFlags.actionFailed')}
    </div>
  {/if}

  <SectionCard title={$t('admin.featureFlags.listTitle')} noPad>
    <div style="display:flex;flex-direction:column;">
      {#each data.definitions as def, i (def.key)}
        {@const enabled = data.flags[def.key]}
        <div style="padding:14px 16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;{i > 0 ? 'border-top:1px solid var(--mep-divider);' : ''}">
          <div style="flex:1;min-width:220px;">
            <div style="font-size:13px;font-weight:600;color:var(--mep-fg);margin-bottom:2px;">
              {$t(def.nameKey)}
            </div>
            <div style="font-size:11px;color:var(--mep-fg-3);">
              {$t(def.descriptionKey)}
            </div>
          </div>
          <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:{enabled ? 'var(--mep-pos)' : 'var(--mep-fg-4)'};">
            {enabled ? $t('admin.featureFlags.stateOn') : $t('admin.featureFlags.stateOff')}
          </div>
          <form method="POST" action="?/toggle" use:enhance>
            <input type="hidden" name="key" value={def.key} />
            <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
            <button type="submit" class={enabled ? 'btn btn-secondary' : 'btn btn-primary'}
              style="height:34px;padding:0 14px;font-size:13px;">
              {enabled ? $t('admin.featureFlags.disable') : $t('admin.featureFlags.enable')}
            </button>
          </form>
        </div>
      {/each}
    </div>
  </SectionCard>

</div>
