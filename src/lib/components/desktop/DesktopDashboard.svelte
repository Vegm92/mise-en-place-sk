<script lang="ts">
  import TrendChart from '$lib/components/TrendChart.svelte';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import SupplierRow from '$lib/components/mep/SupplierRow.svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import AlertRow from '$lib/components/mep/AlertRow.svelte';
  import PeriodPicker from '$lib/components/mep/PeriodPicker.svelte';
  import { Bell, TriangleAlert, ChevronRight, X } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import { fmtEur, fmtEurCompact } from '$lib/formatters';

  interface Mom { this_month: number; pct_change: number | null }
  interface Pending { count: number; amount: number }
  interface AlertCounts { high: number; med: number }
  interface Projection { projected_eom: number; days_elapsed: number; elapsed_pct: number }
  interface PendingInvoice { id: number; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; item_count: number; display_amount: number | null }
  interface RecentInvoice { id: number; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; item_count: number; display_amount: number | null; status: string }
  interface Supplier { name: string; color: string | null; month_spend: number; delta: number | null }
  interface CategorySpend { category: string; color: string; total: number; pct: number }
  interface Reminder { id: number; supplier_name: string | null; display_amount: number | null; overdue: boolean; days_delta: number }
  interface Aging { fresh: number; mid: number; old: number }
  interface MissingInvoice { supplier_name: string; days_late: number; frequency: string }
  interface ShockAlert { id: number; payload: { ingredient?: string; supplier?: string; oldPrice?: number; newPrice?: number; deviationPct?: number } | null }
  interface DashAlert { id: string; sev: 'high' | 'med' | 'low'; kind: 'price' | 'budget' | 'due' | 'info'; text: string; detail?: string; when?: string }

  interface DashboardData {
    firstInvoice: boolean | null;
    mom: Mom;
    pending: Pending;
    paid_month: { count: number };
    spark_data: number[] | null;
    supplier_count: number;
    avg_per_supplier: number | null;
    avg_per_supplier_delta: number | null;
    avg_invoice: number | null;
    total_pct_actual: number;
    total_budget: number;
    budget_threshold: number;
    total_spent: number;
    total_pct_bar: number;
    dashboard_alerts: DashAlert[];
    alert_counts: AlertCounts;
    pending_invoices: PendingInvoice[];
    recent_invoices: RecentInvoice[];
    suppliers: Supplier[];
    projection: Projection | null;
    valid_categories: string[];
    budgets: Record<string, number>;
    category_spend_map: Record<string, number>;
    category_spend: CategorySpend[];
    price_shock_alerts: ShockAlert[];
    reminders: Reminder[];
    aging: Aging;
    missing_invoices: MissingInvoice[];
  }

  let {
    data,
    prevMonthUrl,
    nextMonthUrl,
    canGoForward,
    currentPeriod,
  }: {
    data: DashboardData;
    prevMonthUrl: string;
    nextMonthUrl: string;
    canGoForward: boolean;
    currentPeriod: string;
  } = $props();

  let remindersDismissed   = $state(false);
  let firstInvoiceDismissed = $state(false);
  let dismissedShocks      = $state<Set<number>>(new Set());

  const visibleShocks = $derived(
    data.price_shock_alerts.filter(a => !dismissedShocks.has(a.id))
  );

  const supplierRows = $derived.by(() => {
    const totalSpend = data.suppliers.reduce((a, x) => a + x.month_spend, 0);
    const maxSpend   = Math.max(0, ...data.suppliers.map(x => x.month_spend));
    return data.suppliers.slice(0, 6).map(s => ({
      ...s,
      pct:      totalSpend > 0 ? (s.month_spend / totalSpend) * 100 : 0,
      barWidth: maxSpend   > 0 ? (s.month_spend / maxSpend)   * 100 : 0,
    }));
  });

  const projElapsedPct = $derived(data.projection?.elapsed_pct ?? 0);
  const projOverBudget = $derived(
    data.total_budget > 0 && data.projection != null && data.projection.projected_eom > data.total_budget
  );
  const projOverAmount = $derived(
    data.total_budget > 0 && data.projection != null
      ? Math.max(0, data.projection.projected_eom - data.total_budget)
      : 0
  );

  const priceChanges = $derived(
    data.price_shock_alerts
      .filter(a => a.payload?.oldPrice != null && a.payload?.newPrice != null)
      .slice(0, 4)
      .map(a => ({
        name: a.payload!.ingredient ?? '',
        sup:  a.payload!.supplier ?? '',
        from: a.payload!.oldPrice!,
        to:   a.payload!.newPrice!,
        pct:  a.payload!.deviationPct ?? 0,
        drop: (a.payload!.deviationPct ?? 0) < 0,
      }))
  );

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
  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  async function dismissShock(id: number) {
    dismissedShocks = new Set([...dismissedShocks, id]);
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }
</script>

<div class="hidden md:flex flex-col gap-4 p-6">

  <!-- Period picker row -->
  <div style="display:flex;align-items:center;gap:10px;">
    <PeriodPicker prevUrl={prevMonthUrl} nextUrl={nextMonthUrl} canGoForward={canGoForward} label={currentPeriod} />
  </div>

  <!-- ── First Invoice Banner ───────────────────────────────────────── -->
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
      ><X size={13} /></button>
    </div>
  {/if}

  <!-- ── KPI Strip ───────────────────────────────────────────────────── -->
  <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
    <KpiCard
      label="Gasto este mes"
      value={data.mom.this_month > 0 ? fmtEurCompact(data.mom.this_month) : '—'}
      delta={data.mom.pct_change ?? undefined}
      deltaCtx="vs. mes anterior"
      sub="{data.pending.count + data.paid_month.count} facturas · {data.supplier_count} proveedores"
      spark={data.spark_data ?? undefined}
    />
    <KpiCard
      label="Media por proveedor"
      value={data.avg_per_supplier != null ? fmtEurCompact(data.avg_per_supplier) : '—'}
      delta={data.avg_per_supplier_delta ?? undefined}
      deltaCtx="vs. mes anterior"
      spark={data.spark_data?.map((v: number) => v / Math.max(data.supplier_count, 1)) ?? undefined}
    />
    <KpiCard
      label={$t('dash.kpi.pending')}
      value={fmtEurCompact(data.pending.amount)}
      sub="{data.pending.count} {data.pending.count === 1 ? $t('misc.invoice') : $t('misc.invoices')}"
      variant={data.pending.count > 0 ? 'warn' : 'default'}
    />
    <KpiCard
      label="Presupuesto usado"
      value={data.total_budget > 0 ? (data.total_pct_actual + '%') : '—'}
      sub={data.total_budget > 0 ? `de ${fmtEurCompact(data.total_budget)}` : 'Sin presupuesto'}
      variant={data.total_pct_actual >= 100 ? 'neg' : data.total_pct_actual >= data.budget_threshold ? 'warn' : 'default'}
      spark={data.total_budget > 0 ? [10, 22, 31, 39, 48, 56, 64, Number(data.total_pct_actual)] : undefined}
      invert
    />
  </div>

  <!-- ── Spend chart + Alerts panel ────────────────────────────────── -->
  <div class="grid gap-3 max-[900px]:grid-cols-1" style="grid-template-columns:2fr 1fr;">

    <SectionCard title={$t('dash.chart')} sub={$t('dash.chart.sub')}>
      <TrendChart initialScale="30d" />
    </SectionCard>

    {#if data.dashboard_alerts.length > 0}
      <div class="card overflow-hidden flex flex-col">
        <div class="card-header">
          <div class="section-title">
            <span class="subtitle">{$t('dash.alerts')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mep-fg-3);">
            {#if data.alert_counts.high > 0}
              <span class="num" style="color:var(--mep-neg);font-weight:600;">{data.alert_counts.high}</span>
              <span>{$t('dash.alerts.high')}</span>
            {/if}
            {#if data.alert_counts.high > 0 && data.alert_counts.med > 0}
              <span style="color:var(--mep-divider);">·</span>
            {/if}
            {#if data.alert_counts.med > 0}
              <span class="num" style="color:var(--mep-warn);font-weight:600;">{data.alert_counts.med}</span>
              <span>{$t('dash.alerts.med')}</span>
            {/if}
          </div>
        </div>
        <div class="p-3 flex flex-col gap-2 flex-1">
          {#each data.dashboard_alerts as alert (alert.id)}
            <AlertRow {alert} />
          {/each}
        </div>
        <div style="margin:0 12px 12px;padding-top:10px;border-top:1px solid var(--mep-divider);">
          <a href="/invoices" class="btn btn-ghost" style="width:100%;justify-content:space-between;padding:0 6px;height:28px;text-decoration:none;font-size:12px;">
            <span>{$t('action.allAlerts')}</span>
            <ChevronRight size={13} />
          </a>
        </div>
      </div>
    {:else}
      <!-- Fallback secondary KPIs when no alerts -->
      <div class="card overflow-hidden">
        <div class="grid" style="grid-template-columns:repeat(3,1fr);">
          {#each [
            { label: $t('dash.kpi.mom'),       value: data.mom.pct_change != null ? (data.mom.pct_change >= 0 ? '+' : '') + data.mom.pct_change + '%' : '—', sub: $t('dash.kpi.mom.sub'), variant: momVariant(data.mom.pct_change) },
            { label: $t('dash.kpi.avgInvoice'), value: data.avg_invoice != null ? fmtEurCompact(data.avg_invoice) : '—', sub: 'EUR', variant: 'default' as const },
            { label: $t('dash.kpi.suppliers'),  value: String(data.supplier_count), sub: $t('dash.kpi.active'), variant: 'default' as const, last: true },
          ] as kpi}
            <div class="flex flex-col gap-1.5 p-3.5 {kpi.last ? '' : 'border-r border-divider'}">
              <span class="label">{kpi.label}</span>
              <span class="num text-fg" style="font-size:20px;font-weight:600;letter-spacing:-0.4px;line-height:1.1;">{kpi.value}</span>
              <span class="body" style="font-size:11px;">{kpi.sub}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  </div>

  <!-- ── "Por revisar" pending invoices ────────────────────────────── -->
  {#if data.pending_invoices.length > 0}
    <SectionCard
      title="Por revisar"
      sub="{data.pending_invoices.length} {data.pending_invoices.length === 1 ? 'factura extraída espera' : 'facturas extraídas esperan'} confirmación"
      href="/invoices"
      actionLabel="Ver todas"
      noPad
    >
      <div class="overflow-x-auto">
      <table class="tbl" style="border-top:1px solid var(--mep-divider);">
        <thead>
          <tr>
            <th>Proveedor · N.º</th>
            <th>Fecha</th>
            <th class="num">Líneas</th>
            <th class="num">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.pending_invoices as inv (inv.id)}
            <tr class="row">
              <td>
                <div class="flex items-center gap-2">
                  <span class="swatch bg-fg-3"></span>
                  <div style="min-width:0;">
                    <div class="body-strong overflow-hidden text-ellipsis whitespace-nowrap" style="max-width:160px;">{inv.supplier_name ?? '—'}</div>
                    <div class="num" style="font-size:11px;color:var(--mep-fg-3);">{inv.invoice_number ?? '—'}</div>
                  </div>
                </div>
              </td>
              <td class="num" style="font-size:12px;color:var(--mep-fg-2);">{fmtDate(inv.invoice_date)}</td>
              <td class="num" style="font-size:12px;color:var(--mep-fg-2);">{inv.item_count}</td>
              <td class="num" style="font-weight:500;">{fmtEur(inv.display_amount ?? 0)}</td>
              <td style="text-align:right;">
                <a href="/invoice/{inv.id}" class="btn btn-ghost" style="height:26px;padding:0 8px;font-size:12px;text-decoration:none;">
                  Revisar <ChevronRight size={12} />
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>
    </SectionCard>
  {/if}

  <!-- ── Suppliers + Recent invoices ───────────────────────────────── -->
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
            delta={s.delta ?? null}
            formatEur={fmtEur}
          />
        {/each}
      {:else}
        <p class="body">{$t('misc.noData')}</p>
      {/if}
    </SectionCard>

    <SectionCard
      title={$t('dash.invoices')}
      sub={$t('dash.invoices.sub')}
      href="/invoices"
      actionLabel={$t('action.viewAll')}
      noPad
    >
      {#if data.recent_invoices.length}
        <div class="overflow-x-auto">
        <table class="tbl">
          <thead>
            <tr>
              <th>Proveedor · N.º</th>
              <th>Fecha</th>
              <th class="num">Líneas</th>
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
                    <div style="min-width:0;">
                      <div class="body-strong overflow-hidden text-ellipsis whitespace-nowrap" style="max-width:130px;">{inv.supplier_name ?? '—'}</div>
                      <div class="num" style="font-size:11px;color:var(--mep-fg-3);">{inv.invoice_number ?? '—'}</div>
                    </div>
                  </div>
                </td>
                <td class="num" style="font-size:12px;color:var(--mep-fg-2);">{fmtDate(inv.invoice_date)}</td>
                <td class="num" style="font-size:12px;color:var(--mep-fg-2);">{inv.item_count}</td>
                <td class="num" style="font-weight:500;">{fmtEur(inv.display_amount ?? 0)}</td>
                <td><StatusBadge status={inv.status} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
      {:else}
        <p class="body p-4">{$t('misc.noData')}</p>
      {/if}
    </SectionCard>

  </div>

  <!-- ── Budget + projection + Category spend + Price changes ──────── -->
  <div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">

    <SectionCard title={$t('dash.budget')} href="/budgets" actionLabel={$t('action.edit')}>
      {#if data.total_budget === 0}
        <p class="body">
          {$t('dash.budget.empty')}
          <a href="/budgets" class="text-acc">{$t('dash.budget.set')}</a>
        </p>
      {:else}
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center">
              <span class="body" style="font-size:11px;">{Math.round(data.total_pct_actual)}% {$t('dash.budget.used')}</span>
              <span class="num body" style="font-size:11px;">{fmtEurCompact(data.total_spent)} / {fmtEurCompact(data.total_budget)}</span>
            </div>
            <div class="h-1.5 bg-divider rounded-full overflow-hidden">
              <div class="h-full rounded-full bg-acc" style="width:{data.total_pct_bar}%;"></div>
            </div>
          </div>

          {#if data.projection && data.projection.projected_eom > 0}
            <div style="padding:10px 12px;border-radius:8px;background:var(--mep-surface-2);border:1px solid var(--mep-divider);">
              <div class="flex justify-between" style="font-size:11px;color:var(--mep-fg-3);margin-bottom:6px;">
                <span>Real ({data.projection.days_elapsed}d) <span class="num" style="color:var(--mep-fg);font-weight:500;margin-left:4px;">{fmtEurCompact(data.mom.this_month)}</span></span>
                <span>Proyectado <span class="num" style="color:var(--mep-fg);font-weight:500;margin-left:4px;">{fmtEurCompact(data.projection.projected_eom)}</span></span>
              </div>
              <div style="position:relative;height:8px;border-radius:4px;background:var(--mep-divider);overflow:hidden;">
                <div style="position:absolute;left:0;top:0;bottom:0;width:{projElapsedPct}%;background:var(--mep-acc);border-radius:4px 0 0 4px;"></div>
                <div style="position:absolute;left:{projElapsedPct}%;top:0;bottom:0;right:0;background:repeating-linear-gradient(45deg,var(--mep-acc-soft),var(--mep-acc-soft) 4px,transparent 4px,transparent 8px);"></div>
              </div>
              {#if projOverBudget}
                <div style="font-size:11px;color:var(--mep-fg-3);margin-top:6px;">
                  A este ritmo superarías el presupuesto en
                  <span class="num" style="color:var(--mep-neg);font-weight:500;">{fmtEurCompact(projOverAmount)}</span>.
                </div>
              {/if}
            </div>
          {/if}

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

    <div class="flex flex-col gap-3">
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

      {#if priceChanges.length > 0}
        <SectionCard title="Cambios de precio" sub="últimas facturas procesadas">
          <div class="flex flex-col">
            {#each priceChanges as pc, i (pc.name)}
              <div class="flex items-center gap-3 py-2 {i < priceChanges.length - 1 ? 'border-b border-divider' : ''}">
                <span style="width:3px;height:28px;border-radius:2px;flex-shrink:0;background:{pc.drop ? 'var(--mep-pos)' : 'var(--mep-neg)'};"></span>
                <div style="flex:1;min-width:0;">
                  <div class="body-strong overflow-hidden text-ellipsis whitespace-nowrap" style="font-size:12.5px;">{pc.name}</div>
                  <div style="font-size:11px;color:var(--mep-fg-3);">{pc.sup}</div>
                </div>
                <div class="num" style="font-size:11.5px;color:var(--mep-fg-3);text-decoration:line-through;">{fmtEur(pc.from)}</div>
                <div class="num" style="font-size:13px;font-weight:600;color:{pc.drop ? 'var(--mep-pos)' : 'var(--mep-neg)'};">{fmtEur(pc.to)}</div>
              </div>
            {/each}
          </div>
        </SectionCard>
      {/if}
    </div>

  </div>

  <!-- ── Reminders ─────────────────────────────────────────────────── -->
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
            <span class="num text-fg" style="font-size:12.5px;font-weight:500;">{fmtEur(r.display_amount ?? 0)}</span>
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

  <!-- ── Invoice aging ─────────────────────────────────────────────── -->
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

  <!-- ── Missing invoices ───────────────────────────────────────────── -->
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
