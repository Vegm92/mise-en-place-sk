<script lang="ts">
  import type { PageData } from './$types';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import SupplierRow from '$lib/components/mep/SupplierRow.svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import { Bell, TriangleAlert, ChevronRight, X, TrendingUp } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import { fmtEur, fmtEurCompact } from '$lib/formatters';

  let { data }: { data: PageData } = $props();

  let remindersDismissed = $state(false);
  let firstInvoiceDismissed = $state(false);

  function momLabel(pct: number | null) {
    if (pct === null) return '—';
    return (pct >= 0 ? '+' : '') + pct + '%';
  }
  function momVariant(pct: number | null) {
    if (pct === null) return 'default' as const;
    return pct > 10 ? 'neg' as const : pct < -5 ? 'pos' as const : 'default' as const;
  }
  function budgetPct(spend: number, budget: number) {
    return Math.min(Math.round((spend / budget) * 100), 100);
  }
  function budgetBarColor(pct: number, threshold: number) {
    if (pct >= 100)       return 'var(--mep-neg)';
    if (pct >= threshold) return 'var(--mep-warn)';
    return 'var(--mep-acc)';
  }

  let dismissedShocks = $state<Set<number>>(new Set());
  const visibleShocks = $derived(
    data.price_shock_alerts.filter((a: { id: number }) => !dismissedShocks.has(a.id))
  );

  async function dismissShock(id: number) {
    dismissedShocks = new Set([...dismissedShocks, id]);
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }

  // Derived supplier stats — pre-compute aggregates once to avoid O(n²)
  const supplierRows = $derived.by(() => {
    const totalSpend = data.suppliers.reduce((a: number, x: { month_spend: number }) => a + x.month_spend, 0);
    const maxSpend   = Math.max(0, ...data.suppliers.map((x: { month_spend: number }) => x.month_spend));
    return data.suppliers.slice(0, 6).map((s: { name: string; color: string; month_spend: number }) => ({
      ...s,
      pct:      totalSpend > 0 ? (s.month_spend / totalSpend) * 100 : 0,
      barWidth: maxSpend   > 0 ? (s.month_spend / maxSpend)   * 100 : 0,
    }));
  });
</script>

<div class="flex flex-col gap-4 p-6">

  <!-- ── First Invoice Congratulations Banner ───────────────────── -->
  {#if data.firstInvoice && !firstInvoiceDismissed}
    <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:8px;background:var(--mep-pos-soft);border-left:3px solid var(--mep-pos);">
      <span style="font-size:18px;flex-shrink:0;line-height:1.2;">🎉</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--mep-pos);margin-bottom:2px;">Tu primera factura está guardada</div>
        <div style="font-size:12.5px;color:var(--mep-fg-2);">Este es tu panel de compras — se enriquece con cada factura que añadas. Sube más facturas para ver tendencias de gasto, alertas de precio y análisis de proveedores.</div>
      </div>
      <button
        style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--mep-fg-3);padding:2px;"
        onclick={() => firstInvoiceDismissed = true}
        aria-label="Cerrar"
      >
        <X size={13} />
      </button>
    </div>
  {/if}

  <!-- ── Price Shock Alerts ───────────────────────────────────────── -->
  {#if visibleShocks.length > 0}
    <div style="display:flex;flex-direction:column;gap:6px;">
      {#each visibleShocks as alert (alert.id)}
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:8px;background:var(--mep-neg-soft);border-left:3px solid var(--mep-neg);">
          <TrendingUp size={15} style="flex-shrink:0;margin-top:1px;color:var(--mep-neg);" />
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:500;color:var(--mep-neg);">Price Alert</div>
            <div style="font-size:12.5px;color:var(--mep-fg-2);margin-top:1px;">{alert.message}</div>
          </div>
          <button
            style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--mep-fg-3);padding:2px;"
            onclick={() => dismissShock(alert.id)}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- ── KPI Strip ───────────────────────────────────────────────── -->
  <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
    <KpiCard
      label={$t('dash.kpi.overdue')}
      value={data.overdue.count}
      sub={$t('dash.kpi.overdue.sub')}
      variant={data.overdue.count > 0 ? 'neg' : 'default'}
    />
    <KpiCard
      label={$t('dash.kpi.dueWeek')}
      value={fmtEurCompact(data.due_week.amount)}
      sub="{data.due_week.count} {data.due_week.count === 1 ? $t('misc.invoice') : $t('misc.invoices')}"
      variant={data.due_week.count > 0 ? 'warn' : 'default'}
    />
    <KpiCard
      label={$t('dash.kpi.pending')}
      value={fmtEurCompact(data.pending.amount)}
      sub="{data.pending.count} {data.pending.count === 1 ? $t('misc.invoice') : $t('misc.invoices')}"
    />
    <KpiCard
      label={$t('dash.kpi.paidMonth')}
      value={fmtEurCompact(data.paid_month.amount)}
      sub="{data.paid_month.count} {data.paid_month.count === 1 ? $t('misc.invoice') : $t('misc.invoices')}"
      variant="pos"
    />
  </div>

  <!-- ── Spend chart + Right column ─────────────────────────────── -->
  <div class="grid gap-3 max-[900px]:grid-cols-1" style="grid-template-columns:2fr 1fr;">

    <!-- Spend chart -->
    <SectionCard title={$t('dash.chart')} sub={$t('dash.chart.sub')}>
      <TrendChart initialScale="30d" />
    </SectionCard>

    <!-- Right: secondary KPIs + aging + reminders -->
    <div class="flex flex-col gap-3">

      <!-- Secondary KPIs inline -->
      <div class="card overflow-hidden">
        <div class="grid" style="grid-template-columns:repeat(3,1fr);">
          {#each [
            { label: $t('dash.kpi.mom'),        value: momLabel(data.mom.pct_change),                             sub: $t('dash.kpi.mom.sub'),   variant: momVariant(data.mom.pct_change) },
            { label: $t('dash.kpi.avgInvoice'),  value: data.avg_invoice != null ? fmtEurCompact(data.avg_invoice) : '—', sub: 'EUR',                     variant: 'default' as const },
            { label: $t('dash.kpi.suppliers'),   value: String(data.supplier_count),                              sub: $t('dash.kpi.active'),    variant: 'default' as const, last: true },
          ] as kpi}
            <div class="flex flex-col gap-1.5 p-3.5 {kpi.last ? '' : 'border-r border-divider'}">
              <span class="label">{kpi.label}</span>
              <span class="num text-fg" style="font-size:20px;font-weight:600;letter-spacing:-0.4px;line-height:1.1;">
                {kpi.value}
              </span>
              <span class="body" style="font-size:11px;">{kpi.sub}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Invoice aging -->
      <SectionCard title={$t('dash.aging')} sub={$t('dash.aging.pending')}>
        <div class="grid grid-cols-3 gap-2">
          {#each [
            { count: data.aging.fresh, label: $t('dash.aging.fresh'), variant: 'default' as const },
            { count: data.aging.mid,   label: $t('dash.aging.mid'),   variant: data.aging.mid > 0 ? 'warn' as const : 'default' as const },
            { count: data.aging.old,   label: $t('dash.aging.old'),   variant: data.aging.old > 0 ? 'neg' as const : 'default' as const },
          ] as bucket}
            {@const tintClass = { default: 'bg-surface-2', neg: 'bg-neg-soft border-neg', warn: 'bg-warn-soft border-warn', pos: 'bg-pos-soft border-pos' }[bucket.variant]}
            {@const numColor  = { default: 'text-fg', neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' }[bucket.variant]}
            <div class="card text-center p-2.5 {tintClass}">
              <div class="num {numColor}" style="font-size:22px;font-weight:600;line-height:1;">{bucket.count}</div>
              <div class="body" style="font-size:10px;margin-top:4px;">{bucket.label}</div>
            </div>
          {/each}
        </div>
      </SectionCard>

      <!-- Reminders -->
      {#if data.reminders.length && !remindersDismissed}
        <div class="card overflow-hidden border-l-[3px] border-l-warn">
          <div class="card-header">
            <div class="flex items-center gap-2">
              <Bell size={13} class="text-warn" />
              <span class="subtitle text-warn" style="font-size:14px;">{$t('dash.reminders')}</span>
            </div>
            <div class="flex items-center gap-2.5">
              <a href="/reminders" class="text-acc no-underline" style="font-size:12px;">{$t('misc.all')}</a>
              <button
                class="btn btn-ghost"
                style="width:24px;height:24px;padding:0;justify-content:center;"
                onclick={() => { remindersDismissed = true; sessionStorage.setItem('reminders-dismissed', '1'); }}
              ><X size={12} /></button>
            </div>
          </div>
          <div class="px-4">
            {#each data.reminders as r (r.id)}
              <div class="flex items-center gap-2 py-2.5 border-b border-divider last:border-0">
                <span class="flex-1 body-strong overflow-hidden text-ellipsis whitespace-nowrap text-sm">{r.supplier_name ?? '—'}</span>
                <span class="num text-fg" style="font-size:12.5px;font-weight:500;">{fmtEur(r.display_amount)}</span>
                {#if r.overdue}
                  <span class="badge badge-overdue">{Math.abs(r.days_delta)}{$t('misc.daysLate')}</span>
                {:else}
                  <span class="badge badge-pending">{r.days_delta}{$t('misc.daysLeft')}</span>
                {/if}
                <form method="post" action="?/markPaid" class="m-0 flex-shrink-0">
                  <input type="hidden" name="invoiceId" value={r.id} />
                  <button type="submit" class="badge badge-confirmed" style="cursor:pointer;border:none;">✓</button>
                </form>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    </div>
  </div>

  <!-- ── Top suppliers + Recent invoices ────────────────────────── -->
  <div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">

    <SectionCard
      title={$t('dash.suppliers')}
      sub={$t('dash.suppliers.sub')}
      href="/suppliers"
      actionLabel={$t('action.viewAll')}
    >
      {#if supplierRows.length}
        {#each supplierRows as s (s.name)}
          <SupplierRow
            name={s.name}
            color={s.color ?? 'var(--mep-fg-3)'}
            spend={s.month_spend}
            pct={s.pct}
            barWidth={s.barWidth}
            formatEur={fmtEur}
          />
        {/each}
      {:else}
        <p class="body">{$t('misc.noData')}</p>
      {/if}
    </SectionCard>

    <!-- Recent invoices (edge-to-edge table) -->
    <SectionCard
      title={$t('dash.invoices')}
      sub={$t('dash.invoices.sub')}
      href="/invoices"
      actionLabel={$t('action.viewAll')}
      noPad
    >
      {#if data.recent_invoices.length}
        <table class="tbl">
          <thead>
            <tr>
              <th>{$t('tbl.supplier')}</th>
              <th class="num">{$t('tbl.total')}</th>
              <th>{$t('tbl.status')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.recent_invoices as inv (inv.id)}
              <tr class="row">
                <td>
                  <div class="flex items-center gap-2">
                    <span class="swatch bg-fg-3"></span>
                    <span class="body-strong overflow-hidden text-ellipsis whitespace-nowrap max-w-[160px]">
                      {inv.supplier_name ?? '—'}
                    </span>
                  </div>
                </td>
                <td class="num" style="font-weight:500;">{fmtEur(inv.display_amount)}</td>
                <td><StatusBadge status={inv.status} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="body p-4">{$t('misc.noData')}</p>
      {/if}
    </SectionCard>

  </div>

  <!-- ── Budget + Category spend ─────────────────────────────────── -->
  <div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">

    <SectionCard title={$t('dash.budget')} href="/budgets" actionLabel={$t('action.edit')}>
      {#if data.total_budget === 0}
        <p class="body">
          {$t('dash.budget.empty')}
          <a href="/budgets" class="text-acc">{$t('dash.budget.set')}</a>
        </p>
      {:else}
        <div class="flex flex-col gap-3">
          <!-- Total bar -->
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center">
              <span class="body" style="font-size:11px;">{Math.round(data.total_pct_actual)}% {$t('dash.budget.used')}</span>
              <span class="num body" style="font-size:11px;">{fmtEurCompact(data.total_spent)} / {fmtEurCompact(data.total_budget)}</span>
            </div>
            <div class="h-1.5 bg-divider rounded-full overflow-hidden">
              <div class="h-full rounded-full bg-acc" style="width:{data.total_pct_bar}%;"></div>
            </div>
          </div>
          <!-- Category bars -->
          {#each data.valid_categories as cat}
            {@const spend  = data.category_spend_map[cat] ?? 0}
            {@const budget = data.budgets[cat] ?? 0}
            {#if budget > 0}
              {@const pct   = budgetPct(spend, budget)}
              {@const color = budgetBarColor(pct, data.budget_threshold)}
              <div class="flex flex-col gap-1">
                <div class="flex justify-between items-center">
                  <span class="body-strong overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]" style="font-size:11px;" title={cat}>{cat}</span>
                  <span class="num" style="font-size:11px;font-weight:600;color:{color};flex-shrink:0;">{pct}%</span>
                </div>
                <div class="h-1 bg-divider rounded-full overflow-hidden">
                  <div class="h-full rounded-full" style="width:{pct}%;background:{color};"></div>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </SectionCard>

    {#if data.category_spend.length}
      <SectionCard title={$t('dash.category')} sub={$t('dash.category.sub')}>
        <div class="flex flex-col gap-2.5">
          {#each data.category_spend as cat (cat.category)}
            <div class="flex items-center gap-3">
              <span class="swatch" style="background:{cat.color};"></span>
              <span class="body-strong overflow-hidden text-ellipsis whitespace-nowrap w-[90px] flex-shrink-0 text-xs" title={cat.category}>{cat.category}</span>
              <div class="flex-1 h-1.5 bg-divider rounded-full overflow-hidden">
                <div class="h-full rounded-full" style="width:{cat.pct}%;background:{cat.color};"></div>
              </div>
              <span class="num text-fg font-semibold w-[60px] text-right flex-shrink-0 text-xs">{fmtEurCompact(cat.total)}</span>
            </div>
          {/each}
        </div>
      </SectionCard>
    {/if}

  </div>

  <!-- ── Missing invoices ─────────────────────────────────────────── -->
  {#if data.missing_invoices.length}
    <div class="card overflow-hidden border-l-[3px] border-l-neg">
      <div class="card-header">
        <div class="flex items-center gap-2">
          <TriangleAlert size={13} class="text-neg flex-shrink-0" />
          <span class="subtitle text-neg" style="font-size:14px;">{$t('dash.missing')}</span>
        </div>
      </div>
      <div class="p-4 flex flex-wrap gap-2">
        {#each data.missing_invoices as m (m.supplier_name)}
          <div class="card p-3 bg-neg-soft border-neg">
            <p class="body-strong text-sm">{m.supplier_name}</p>
            <p class="body" style="font-size:10.5px;margin-top:2px;">{m.days_late}d · {m.frequency}</p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

</div>

