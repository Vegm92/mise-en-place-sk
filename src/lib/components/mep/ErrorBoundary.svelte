<!--
  Reusable client error boundary (issue #255). SvelteKit's handleError only
  covers load/navigation; a runtime error thrown during client render or in an
  effect after hydration (a chart choking on bad data, the batch polling loop)
  would otherwise tear down the component tree and leave a dead/white UI. This
  contains the failure to one panel and offers a retry, and still reports to
  Sentry.
-->
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
      <button type="button" class="btn btn-secondary" style="height:32px;" onclick={reset}>
        {$t('boundary.retry')}
      </button>
    </div>
  {/snippet}
</svelte:boundary>
