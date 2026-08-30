<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/state';
  import MobileDashboard from '$lib/components/mobile/MobileDashboard.svelte';
  import DesktopDashboard from '$lib/components/desktop/DesktopDashboard.svelte';
  import ErrorBoundary from '$lib/components/mep/ErrorBoundary.svelte';
  import DateRangePicker from '$lib/components/mep/DateRangePicker.svelte';
  import { locale, t } from '$lib/i18n';

  let { data }: { data: PageData } = $props();

  const rangeFrom = $derived((data as { range_from?: string }).range_from ?? page.url.searchParams.get('from') ?? '');
  const rangeTo = $derived((data as { range_to?: string }).range_to ?? page.url.searchParams.get('to') ?? '');

  const currentPeriod = $derived.by(() => {
    if (!rangeFrom) return '';
    const from = new Date(rangeFrom + 'T00:00:00');
    const to = new Date(rangeTo + 'T00:00:00');
    const fmt = new Intl.DateTimeFormat($locale, { day: 'numeric', month: 'short' });
    const toFmt = new Intl.DateTimeFormat($locale, { day: 'numeric', month: 'short', year: 'numeric' });
    if (rangeFrom.slice(0, 7) === rangeTo.slice(0, 7)) {
      const s = new Intl.DateTimeFormat($locale, { month: 'long', year: 'numeric' }).format(from);
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    return `${fmt.format(from)} – ${toFmt.format(to)}`;
  });
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileDashboard
    {data}
    {rangeFrom}
    {rangeTo}
    currentPeriod={currentPeriod}
  />
</div>

{#if page.url.searchParams.get('conflict') === '1'}
  <div class="card p-3 text-neg m-4 mb-0" role="alert" style="font-size:13px;">{$t('inv.conflict')}</div>
{/if}

<ErrorBoundary>
  {#snippet children()}
    <DesktopDashboard
      {data}
      {rangeFrom}
      {rangeTo}
      currentPeriod={currentPeriod}
    />
  {/snippet}
</ErrorBoundary>
