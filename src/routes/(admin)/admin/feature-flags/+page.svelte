<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n';
  import AdminPageHead from '$lib/components/admin/AdminPageHead.svelte';
  import HudPanel from '$lib/components/admin/HudPanel.svelte';
  import AdminTableScroll from '$lib/components/admin/AdminTableScroll.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AdminPageHead route="/admin/feature-flags" title={$t('admin.featureFlags.title')} subtitle={$t('admin.featureFlags.subtitle')} />

<div class="hud-page px-3 md:px-6 pb-6 flex flex-col gap-2.5">

  {#if form?.error}
    <div style="background:#0a0c11;border:1px solid rgba(248,113,113,0.35);border-radius:10px;padding:12px 16px;font-size:13px;color:#f87171;">
      {$t('admin.featureFlags.actionFailed')}
    </div>
  {/if}

  <HudPanel title={$t('admin.featureFlags.listTitle')}>
    <AdminTableScroll>
      <table class="hud-table">
        <thead>
          <tr>
            <th scope="col" class="l">{$t('admin.colName')}</th>
            <th scope="col" class="l">{$t('admin.colStatus')}</th>
            <th scope="col" class="r">{$t('admin.dlq.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each data.definitions as def (def.key)}
            {@const enabled = data.flags[def.key]}
            <tr>
              <td>
                <div>{$t(def.nameKey)}</div>
                <div class="dim">{$t(def.descriptionKey)}</div>
              </td>
              <td class="mono" class:good={enabled} class:dim={!enabled}>
                {enabled ? $t('admin.featureFlags.stateOn') : $t('admin.featureFlags.stateOff')}
              </td>
              <td class="r">
                <form method="POST" action="?/toggle" use:enhance>
                  <input type="hidden" name="key" value={def.key} />
                  <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
                  <button type="submit" class={enabled ? 'btn btn-secondary' : 'btn btn-primary'}
                    style="height:30px;padding:0 12px;font-size:12px;">
                    {enabled ? $t('admin.featureFlags.disable') : $t('admin.featureFlags.enable')}
                  </button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableScroll>
  </HudPanel>

</div>
