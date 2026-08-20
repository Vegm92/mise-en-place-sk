<script lang="ts">
  import { t } from '$lib/i18n';
  import ChefHat from '@lucide/svelte/icons/chef-hat';
</script>

<div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;">
  <div style="width:48px;height:48px;border-radius:24px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;">
    <ChefHat size={22} />
  </div>
  <h1 style="font-size:16px;font-weight:600;margin:0;">{$t('recipes.title')}</h1>
  <p style="font-size:13px;color:var(--mep-fg-3);line-height:1.6;margin:0;">{$t('recipes.comingSoon')}</p>
</div>
