<script lang="ts">
  import { page } from '$app/stores';
  import Sparkline from '$lib/components/mep/Sparkline.svelte';
  import Delta from '$lib/components/mep/Delta.svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import { fmtEur, fmtEurCompact, fmtDate, toMonthStr, shiftMonth } from '$lib/formatters';
  import { locale, t, ti, tp } from '$lib/i18n';
  import PeriodPicker from '$lib/components/mep/PeriodPicker.svelte';

  interface Supplier {
    name: string;
    color: string | null;
    month_spend: number;
    delta: number | null;
    invoices?: number;
    cat?: string;
  }
  interface RecentInvoice {
    id: number;
    invoice_number: string | null;
    supplier_name: string | null;
    display_amount: number | null;
    status: string;
    invoice_date: string | null;
  }

  let {
    monthSpend,
    monthDelta,
    totalInvoices,
    sparkData,
    pendingAmount,
    pendingCount,
    budgetPct,
    totalBudget,
    projectedEom,
    highAlerts,
    medAlerts,
    alertText,
    suppliers,
    recentInvoices,
  }: {
    monthSpend: number;
    monthDelta: number | null;
    totalInvoices: number;
    sparkData: number[] | null;
    pendingAmount: number;
    pendingCount: number;
    budgetPct: number;
    totalBudget: number;
    projectedEom: number | null;
    highAlerts: number;
    medAlerts: number;
    alertText: string;
    suppliers: Supplier[];
    recentInvoices: RecentInvoice[];
  } = $props();

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    if (h < 13) return 'mdash.morning';
    if (h < 21) return 'mdash.afternoon';
    return 'mdash.evening';
  });
  const dateStr = $derived(
    new Date().toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' })
  );

  const topSuppliers = $derived(
    [...suppliers].sort((a, b) => b.month_spend - a.month_spend).slice(0, 4)
  );

  const currentMonthStr = $derived(toMonthStr(new Date()));
  const selectedMonth = $derived(
    ($page.data as { selectedMonth?: string }).selectedMonth
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
</script>

<div style="height: 100%; overflow: auto; padding-bottom: 24px;">
  <div style="padding: 0 18px 18px; display: flex; flex-direction: column; gap: 14px;">

    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="font-size:13px;color:var(--mep-fg-3);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        {$t(greeting)} · {dateStr}
      </div>
      <PeriodPicker compact={true} prevUrl={prevMonthUrl} nextUrl={nextMonthUrl} canGoForward={canGoForward} label={currentPeriod} />
    </div>

    <div class="card" style="padding: 16px;">
      <div class="label" style="margin-bottom: 6px;">{$t('ddash.monthSpend')}</div>
      <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
        <div class="num" style="font-size: 32px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.8px; line-height: 1;">
          {monthSpend > 0 ? fmtEurCompact(monthSpend) : '—'}
        </div>
        {#if monthDelta != null}
          <Delta value={monthDelta} />
        {/if}
      </div>
      <div style="font-size: 11.5px; color: var(--mep-fg-3);">
        {$tp('misc.invoice', totalInvoices)}
        {#if projectedEom != null}
          · {$t('mdash.projectionClose')} <span class="num" style="color: var(--mep-fg-2); font-weight: 500;">{fmtEurCompact(projectedEom)}</span>
        {/if}
      </div>

      {#if sparkData && sparkData.length >= 2}
        <div style="margin-top: 14px; height: 50px;">
          <Sparkline data={sparkData} color="var(--mep-acc)" width={350} height={50} />
        </div>
      {/if}

      {#if totalBudget > 0}
        <div style="margin-top: 14px;">
          <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 6px;">
            <span style="color: var(--mep-fg-3);">{$t('mdash.monthBudget')}</span>
            <span class="num" style="color: var(--mep-fg); font-weight: 500;">
              <span style="color: {budgetPct >= 90 ? 'var(--mep-neg)' : budgetPct >= 70 ? 'var(--mep-warn)' : 'var(--mep-acc)'};">
                {budgetPct}%
              </span>
              {$ti('ddash.ofBudget', { amount: fmtEurCompact(totalBudget) })}
            </span>
          </div>
          <div style="height: 6px; border-radius: 3px; background: var(--mep-surface-2); overflow: hidden;">
            <div style="
              width: {Math.min(budgetPct, 100)}%; height: 100%;
              background: {budgetPct >= 90 ? 'var(--mep-neg)' : budgetPct >= 70 ? 'var(--mep-warn)' : 'var(--mep-acc)'};
            "></div>
          </div>
        </div>
      {/if}
    </div>

    {#if highAlerts + medAlerts > 0}
      <a href="/reminders" style="
        display: block; text-decoration: none;
        padding: 12px 14px; border-radius: 10px;
        background: {highAlerts > 0 ? 'var(--mep-neg-soft)' : 'var(--mep-warn-soft)'};
        display: flex; align-items: flex-start; gap: 12px;
      ">
        <div style="color: {highAlerts > 0 ? 'var(--mep-neg)' : 'var(--mep-warn)'}; margin-top: 2px; flex-shrink: 0;">
          <AlertTriangle size={18} />
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="
            font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
            text-transform: uppercase;
            color: {highAlerts > 0 ? 'var(--mep-neg)' : 'var(--mep-warn)'};
            margin-bottom: 2px;
          ">
            {highAlerts + medAlerts} {highAlerts + medAlerts > 1 ? $t('mdash.alerts') : $t('mdash.alert')}
            {highAlerts > 0 ? ' ' + $t('mdash.severe') : ''}
          </div>
          <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); line-height: 1.4;">
            {alertText}
          </div>
          <div style="font-size: 12px; color: var(--mep-fg-2); margin-top: 3px;">
            {$t('mdash.checkMargins')}
          </div>
        </div>
        <ChevronRight size={16} style="color: var(--mep-fg-3); flex-shrink: 0; margin-top: 2px;" />
      </a>
    {/if}

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">{$t('mdash.pendingPayment')}</div>
        <div class="num" style="
          font-size: 19px; font-weight: 600; letter-spacing: -0.3px; line-height: 1;
          color: {pendingAmount > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};
        ">
          {pendingAmount > 0 ? fmtEurCompact(pendingAmount) : '—'}
        </div>
        <div style="margin-top: 6px; font-size: 11px; color: var(--mep-fg-3);">
          {pendingCount} facturas
        </div>
      </div>
      <div class="card" style="padding: 12px;">
        <div class="label" style="font-size: 10.5px; margin-bottom: 5px;">{$t('status.pending')}</div>
        <div class="num" style="
          font-size: 19px; font-weight: 600; letter-spacing: -0.3px; line-height: 1;
          color: {pendingCount > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};
        ">
          {pendingCount}
        </div>
        <div style="margin-top: 6px; font-size: 11px; color: var(--mep-fg-3);">
          {$t('mdash.extractedInvoices')}
        </div>
      </div>
    </div>

    {#if topSuppliers.length > 0}
      <div class="card" style="padding: 14px 14px 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <div class="subtitle" style="font-size: 15px;">{$t('dash.suppliers')}</div>
          <a href="/suppliers" style="color: var(--mep-fg-3); text-decoration: none; display: flex;">
            <ChevronRight size={14} />
          </a>
        </div>
        {#each topSuppliers as s, i}
          {@const sub = [s.cat, s.invoices ? `${s.invoices} facturas` : null].filter(Boolean).join(' · ')}
          <div style="
            display: flex; align-items: center; gap: 12px;
            padding: 8px 0;
            border-bottom: {i < topSuppliers.length - 1 ? '1px solid var(--mep-divider)' : 'none'};
          ">
            <span style="background: {s.color ?? 'var(--mep-fg-3)'}; width: 8px; height: 26px; border-radius: 2px; flex-shrink: 0;"></span>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {s.name}
              </div>
              {#if sub}
                <div style="font-size: 11px; color: var(--mep-fg-3);">{sub}</div>
              {/if}
            </div>
            <div style="text-align: right; flex-shrink: 0;">
              <div class="num" style="font-size: 13px; font-weight: 500; color: var(--mep-fg);">
                {fmtEur(s.month_spend)}
              </div>
              {#if s.delta != null}
                <Delta value={s.delta} />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if recentInvoices.length > 0}
      <div class="card" style="padding: 14px 14px 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div class="subtitle" style="font-size: 15px;">{$t('mdash.recent')}</div>
          <a href="/invoices" style="font-size: 12px; color: var(--mep-acc); font-weight: 500; text-decoration: none;">{$t('action.viewAll')}</a>
        </div>
        {#each recentInvoices.slice(0, 3) as inv, i}
          <a href="/invoice/{inv.id}" style="
            display: flex; align-items: center; gap: 12px;
            padding: 10px 0;
            border-bottom: {i < Math.min(recentInvoices.length, 3) - 1 ? '1px solid var(--mep-divider)' : 'none'};
            text-decoration: none;
          ">
            <div style="
              width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
              background: var(--mep-surface-2); color: var(--mep-fg-2);
              display: flex; align-items: center; justify-content: center;
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {inv.supplier_name ?? '—'}
              </div>
              <div class="num" style="font-size: 11.5px; color: var(--mep-fg-3);">
                {inv.invoice_number ?? '—'} · {fmtDate(inv.invoice_date, $locale)}
              </div>
            </div>
            <div style="text-align: right; flex-shrink: 0;">
              <div class="num" style="font-size: 13.5px; font-weight: 600; color: var(--mep-fg);">
                {inv.display_amount != null ? fmtEur(inv.display_amount) : '—'}
              </div>
              <StatusBadge status={inv.status ?? 'pending'} style="font-size: 9.5px; padding: 1px 5px;" />
            </div>
          </a>
        {/each}
      </div>
    {/if}

  </div>
</div>
