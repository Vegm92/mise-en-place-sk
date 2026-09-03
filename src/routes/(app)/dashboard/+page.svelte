<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/state';
  import MobileDashboard from '$lib/components/mobile/MobileDashboard.svelte';
  import DesktopDashboard from '$lib/components/desktop/DesktopDashboard.svelte';
  import ErrorBoundary from '$lib/components/mep/ErrorBoundary.svelte';
  import { t } from '$lib/i18n';

  let { data }: { data: PageData } = $props();
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileDashboard {data} />
</div>

{#if page.url.searchParams.get('conflict') === '1'}
  <div class="card p-3 text-neg m-4 mb-0" role="alert" style="font-size:13px;">{t('inv.conflict')}</div>
{/if}

<ErrorBoundary>
  {#snippet children()}
    <DesktopDashboard {data} />
  {/snippet}
</ErrorBoundary>
