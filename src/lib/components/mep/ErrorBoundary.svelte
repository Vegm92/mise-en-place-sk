<script lang="ts">
  import * as Sentry from '@sentry/sveltekit';
  import { t } from '$lib/i18n';
  import type { Snippet } from 'svelte';

  let { children, label }: { children: Snippet; label?: string } = $props();
</script>

<svelte:boundary onerror={(e) => Sentry.captureException(e)}>
  {@render children()}

  {#snippet failed(_error, reset)}
    <div class="card p-4 text-center" role="alert" style="font-size:13px;color:var(--mep-fg-2);">
      <p style="margin:0 0 10px;">{label ?? $t('boundary.failed')}</p>
      <button type="button" class="btn btn-secondary" onclick={reset}>
        {$t('boundary.retry')}
      </button>
    </div>
  {/snippet}
</svelte:boundary>
