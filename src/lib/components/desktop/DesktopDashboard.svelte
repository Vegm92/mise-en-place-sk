<script lang="ts">
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import AlertRow from '$lib/components/mep/AlertRow.svelte';
  import NotificationItem from '$lib/components/mep/NotificationItem.svelte';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { locale, t, tp } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';
  import { groupNotifications, type Notif } from '$lib/notification-display';

  interface AlertCounts { high: number; med: number }
  interface PendingInvoice { id: number; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; item_count: number; display_amount: number | null }
  interface Reminder { id: number; supplier_name: string | null; invoice_number: string | null; display_amount: number | null; overdue: boolean; days_delta: number }
  interface MissingInvoice { supplier_name: string; days_late: number; frequency: string }
  interface DashAlert { id: string; sev: 'high' | 'med' | 'low'; kind: 'price' | 'budget' | 'due' | 'info'; text: string; detail?: string; when?: string }

  interface DashboardData {
    firstInvoice: boolean | null;
    dashboard_alerts: DashAlert[];
    alert_counts: AlertCounts;
    pending_invoices: PendingInvoice[];
    missing_invoices: MissingInvoice[];
    hoy_overdue: Reminder[];
    hoy_due_soon: Reminder[];
    hoy_total_pending_amount: number;
    hoy_notifications: Notif[];
  }

  let { data }: { data: DashboardData } = $props();

  let firstInvoiceDismissed = $state(false);

  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let notifItems = $state<Notif[]>(data.hoy_notifications);
  const groups = $derived(groupNotifications(notifItems));

  let decidingCategory = $state<number | null>(null);
  let deciding = $state<number | null>(null);

  async function dismiss(id: number) {
    const removed = notifItems.find((n) => n.id === id);
    const removedIndex = notifItems.findIndex((n) => n.id === id);
    notifItems = notifItems.filter((n) => n.id !== id);
    try {
      const resp = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!resp.ok) throw new Error(`dismiss failed: ${resp.status}`);
    } catch {
      if (removed && removedIndex >= 0) {
        const next = [...notifItems];
        next.splice(removedIndex, 0, removed);
        notifItems = next;
      }
    }
  }

  async function acceptCategory(n: Notif) {
    const p = n.payload as { supplierId?: number; suggestedCategory?: string } | null;
    if (typeof p?.supplierId !== 'number' || decidingCategory !== null) return;
    decidingCategory = n.id;
    try {
      const resp = await fetch('/api/supplier-category', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          supplierId: p.supplierId,
          action: 'accept',
          category: p.suggestedCategory,
        }),
      });
      if (resp.ok || resp.status === 404) notifItems = notifItems.filter((i) => i.id !== n.id);
    } catch {
    } finally {
      decidingCategory = null;
    }
  }

  async function decideProduct(n: Notif, accept: boolean) {
    const p = n.payload as { description?: string; source?: string; candidateProductId?: number } | null;
    const description = p?.description;
    if (!description || deciding !== null) return;
    const isLlm = p?.source === 'llm';
    const bodyObj: Record<string, unknown> = { description };
    if (accept) {
      bodyObj.action = 'confirm';
      if (isLlm && typeof p?.candidateProductId === 'number') bodyObj.targetProductId = p.candidateProductId;
    } else {
      bodyObj.action = isLlm ? 'dismiss' : 'reject';
    }
    deciding = n.id;
    try {
      const resp = await fetch('/api/product-aliases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
      if (resp.ok) notifItems = notifItems.filter((i) => i.id !== n.id);
    } catch {
    } finally {
      deciding = null;
    }
  }

  const nothingPending = $derived(
    data.dashboard_alerts.length === 0 &&
    data.hoy_overdue.length === 0 &&
    data.hoy_due_soon.length === 0 &&
    notifItems.length === 0 &&
    data.pending_invoices.length === 0 &&
    data.missing_invoices.length === 0
  );

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString($locale, { day: '2-digit', month: 'short' });
  }
</script>

<div class="hidden md:flex flex-col gap-4 p-6" data-coach="dashboard-main">

  <div>
    <span class="title-lg">{$t('nav.hoy')}</span>
    <p class="body" style="margin-top:2px;">{$t('nav.hoy.sub')}</p>
  </div>

  {#if data.firstInvoice && !firstInvoiceDismissed}
    <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:8px;background:var(--mep-pos-soft);border-left:3px solid var(--mep-pos);">
      <span style="font-size:18px;flex-shrink:0;line-height:1.2;">🎉</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--mep-pos);margin-bottom:2px;">{$t('ddash.firstInvoiceTitle')}</div>
        <div style="font-size:12.5px;color:var(--mep-fg-2);">{$t('ddash.firstInvoiceBody')}</div>
      </div>
      <button
        style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--mep-fg-3);padding:2px;"
        onclick={() => firstInvoiceDismissed = true}
        aria-label={$t('ddash.close')}
      ><X size={13} /></button>
    </div>
  {/if}

  {#if nothingPending}
    <div class="card" style="padding:48px 24px;text-align:center;">
      <p class="body">{$t('rem.allEmpty')}</p>
    </div>
  {/if}

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
      <div class="p-3 flex flex-col gap-2">
        {#each data.dashboard_alerts as alert (alert.id)}
          <AlertRow {alert} />
        {/each}
      </div>
    </div>
  {/if}

  {#if data.hoy_overdue.length || data.hoy_due_soon.length}
    <div class="card overflow-hidden">
      <div class="card-header">
        <div class="flex items-center gap-2 flex-wrap" style="font-size:12.5px;">
          {#if data.hoy_overdue.length}
            <span class="badge badge-overdue">{data.hoy_overdue.length} {$t('rem.overdue').toLowerCase()}</span>
          {/if}
          <span class="body">{data.hoy_due_soon.length} {$t('rem.dueWeek').toLowerCase()}</span>
          <span class="body">·</span>
          <span class="body">{$t('rem.totalPending')}: <span class="num text-fg" style="font-weight:500;">{fmtEur(data.hoy_total_pending_amount)}</span></span>
        </div>
        {#if data.hoy_overdue.length || data.hoy_due_soon.length}
          <form method="post" action="?/bulkPaid">
            {#each [...data.hoy_overdue, ...data.hoy_due_soon] as r (r.id)}
              <input type="hidden" name="invoice_ids" value={r.id} />
            {/each}
            <button type="submit" class="btn btn-ghost text-pos" style="height:28px;font-size:12px;gap:4px;">
              <Check size={12} />{$t('rem.markAllPaid')}
            </button>
          </form>
        {/if}
      </div>
      <div class="px-2">
        {#each [...data.hoy_overdue, ...data.hoy_due_soon] as r (r.id)}
          <div class="flex items-center gap-3 px-2 py-2.5 border-b border-divider last:border-0">
            <div style="flex:1;min-width:0;">
              <div class="body-strong overflow-hidden text-ellipsis whitespace-nowrap" style="font-size:12.5px;">{r.supplier_name ?? '—'}</div>
              <div class="body" style="font-size:11px;">{r.invoice_number ?? '—'}</div>
            </div>
            {#if r.overdue}
              <span class="badge badge-overdue">{Math.abs(r.days_delta)}{$t('rem.daysOverdue')}</span>
            {:else}
              <span class="badge badge-pending">{r.days_delta}{$t('misc.daysLeft')}</span>
            {/if}
            <span class="num text-fg" style="font-size:12.5px;font-weight:500;width:80px;text-align:right;flex-shrink:0;">{fmtEur(r.display_amount ?? 0)}</span>
            <form method="post" action="?/markPaid" class="m-0 flex-shrink-0">
              <input type="hidden" name="invoiceId" value={r.id} />
              <button type="submit" class="btn btn-ghost text-pos" style="height:26px;font-size:12px;gap:4px;">
                <Check size={12} />{$t('inv.markPaid')}
              </button>
            </form>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if groups.priceShock.length}
    <SectionCard title={$t('rem.priceShock')} noPad>
      <div class="divide-y divide-divider">
        {#each groups.priceShock as n (n.id)}
          <div class="px-4 py-3">
            <NotificationItem notification={n} onDismiss={dismiss} onAcceptCategory={acceptCategory} onDecideProduct={decideProduct} />
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

  {#if groups.lowStock.length}
    <SectionCard title={$t('rem.lowStock')} noPad>
      <div class="divide-y divide-divider">
        {#each groups.lowStock as n (n.id)}
          <div class="px-4 py-3">
            <NotificationItem notification={n} onDismiss={dismiss} onAcceptCategory={acceptCategory} onDecideProduct={decideProduct} />
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

  {#if groups.budget.length}
    <SectionCard title={$t('rem.budget')} noPad>
      <div class="divide-y divide-divider">
        {#each groups.budget as n (n.id)}
          <div class="px-4 py-3">
            <NotificationItem notification={n} onDismiss={dismiss} onAcceptCategory={acceptCategory} onDecideProduct={decideProduct} />
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

  {#if groups.suppliers.length}
    <SectionCard title={$t('rem.suppliers')} noPad>
      <div class="divide-y divide-divider">
        {#each groups.suppliers as n (n.id)}
          <div class="px-4 py-3">
            <NotificationItem
              notification={n}
              onDismiss={dismiss}
              onAcceptCategory={acceptCategory}
              onDecideProduct={decideProduct}
              decidingCategoryId={decidingCategory}
            />
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

  {#if groups.other.length}
    <SectionCard title={$t('rem.other')} noPad>
      <div class="divide-y divide-divider">
        {#each groups.other as n (n.id)}
          <div class="px-4 py-3">
            <NotificationItem
              notification={n}
              onDismiss={dismiss}
              onAcceptCategory={acceptCategory}
              onDecideProduct={decideProduct}
              decidingProductId={deciding}
            />
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

  {#if data.pending_invoices.length > 0}
    <SectionCard
      title={$t('ddash.toReview')}
      sub={$tp('ddash.awaitingConfirm', data.pending_invoices.length)}
      href="/invoices"
      actionLabel={$t('action.viewAll')}
      noPad
    >
      <div class="overflow-x-auto">
      <table class="tbl" style="border-top:1px solid var(--mep-divider);">
        <thead>
          <tr>
            <th>{$t('ddash.colSupplierNum')}</th>
            <th>{$t('tbl.date')}</th>
            <th class="num">{$t('tbl.lines')}</th>
            <th class="num">{$t('tbl.total')}</th>
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
                  {$t('action.review')} <ChevronRight size={12} />
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>
    </SectionCard>
  {/if}

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
