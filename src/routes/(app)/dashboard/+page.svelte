<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/state';
  import MobileDashboard from '$lib/components/mobile/MobileDashboard.svelte';
  import DesktopDashboard from '$lib/components/desktop/DesktopDashboard.svelte';
  import ErrorBoundary from '$lib/components/mep/ErrorBoundary.svelte';
  import { toMonthStr, shiftMonth } from '$lib/formatters';
  import { locale, t } from '$lib/i18n';

  let { data }: { data: PageData } = $props();

  const currentMonthStr = $derived(toMonthStr(new Date()));
  const selectedMonth = $derived(
    (data as { selectedMonth?: string }).selectedMonth
    ?? page.url.searchParams.get('month')
    ?? currentMonthStr
  );
  const currentPeriod = $derived.by(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y!, m! - 1, 2);
    const s = new Intl.DateTimeFormat($locale, { month: 'long', year: 'numeric' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
  const prevMonthUrl = $derived(`/dashboard?month=${shiftMonth(selectedMonth, -1)}`);
  const nextMonthUrl = $derived(`/dashboard?month=${shiftMonth(selectedMonth, 1)}`);
  const canGoForward = $derived(selectedMonth < currentMonthStr);
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileDashboard
    {data}
    prevMonthUrl={prevMonthUrl}
    nextMonthUrl={nextMonthUrl}
    canGoForward={canGoForward}
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
      prevMonthUrl={prevMonthUrl}
      nextMonthUrl={nextMonthUrl}
      canGoForward={canGoForward}
      currentPeriod={currentPeriod}
    />
  {/snippet}
</ErrorBoundary>
