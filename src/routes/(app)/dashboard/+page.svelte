<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/stores';
  import MobileDashboard from '$lib/components/mobile/MobileDashboard.svelte';
  import DesktopDashboard from '$lib/components/desktop/DesktopDashboard.svelte';
  import { toMonthStr, shiftMonth } from '$lib/formatters';
  import { locale, t } from '$lib/i18n';

  let { data }: { data: PageData } = $props();

  // Period picker — derived values shared between mobile and desktop
  const currentMonthStr = $derived(toMonthStr(new Date()));
  const selectedMonth = $derived(
    (data as { selectedMonth?: string }).selectedMonth
    ?? $page.url.searchParams.get('month')
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

  const mobileAlertText = $derived.by(() => {
    const shocks = (data.price_shock_alerts as Array<{ payload: { ingredient?: string; deviationPct?: number } | null }>)
      .filter(a => a.payload?.ingredient)
      .slice(0, 2)
      .map(a => `${a.payload!.ingredient} ${(a.payload!.deviationPct ?? 0) > 0 ? '+' : ''}${Math.round(a.payload!.deviationPct ?? 0)}%`);
    return shocks.length ? shocks.join(' · ') : $t('dash.checkPriceAlerts');
  });
</script>

<!-- Mobile dashboard -->
<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileDashboard
    monthSpend={data.mom.this_month}
    monthDelta={data.mom.pct_change}
    totalInvoices={data.pending.count + data.paid_month.count}
    sparkData={data.spark_data}
    pendingAmount={data.pending.amount}
    pendingCount={data.pending.count}
    budgetPct={data.total_pct_actual}
    totalBudget={data.total_budget}
    projectedEom={data.projection?.projected_eom ?? null}
    highAlerts={data.alert_counts.high}
    medAlerts={data.alert_counts.med}
    alertText={mobileAlertText}
    suppliers={data.suppliers}
    recentInvoices={data.recent_invoices}
  />
</div>

<!-- Desktop dashboard -->
<DesktopDashboard
  {data}
  prevMonthUrl={prevMonthUrl}
  nextMonthUrl={nextMonthUrl}
  canGoForward={canGoForward}
  currentPeriod={currentPeriod}
/>
