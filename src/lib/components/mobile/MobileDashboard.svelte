<script lang="ts">
  import AlertRow from '$lib/components/mep/AlertRow.svelte';
  import NotificationItem from '$lib/components/mep/NotificationItem.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Check from '@lucide/svelte/icons/check';
  import { fmtEur, fmtDate } from '$lib/formatters';
  import { locale, t } from '$lib/i18n';
  import { groupNotifications, type Notif } from '$lib/notification-display';

  interface AlertCounts { high: number; med: number }
  interface PendingInvoice { id: number; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; item_count: number; display_amount: number | null }
  interface Reminder { id: number; supplier_name: string | null; invoice_number: string | null; display_amount: number | null; overdue: boolean; days_delta: number }
  interface MissingInvoice { supplier_name: string; days_late: number; frequency: string }
  interface DashAlert { id: string; sev: 'high' | 'med' | 'low'; kind: 'price' | 'budget' | 'due' | 'info'; text: string; detail?: string; when?: string }

  interface DashboardData {
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

  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let notifItems = $state<Notif[]>(data.hoy_notifications);
  const groups = $derived(groupNotifications(notifItems));

  let decidingCategory = $state<number | null>(null);
  let deciding = $state<number | null>(null);

  async function dismiss(id: number) {
    notifItems = notifItems.filter((n) => n.id !== id);
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
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
        body: JSON.stringify({ supplierId: p.supplierId, action: 'accept', category: p.suggestedCategory }),
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

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    if (h < 13) return 'mdash.morning';
    if (h < 21) return 'mdash.afternoon';
    return 'mdash.evening';
  });
  const dateStr = $derived(
    new Date().toLocaleDateString($locale, { weekday: 'long', day: 'numeric', month: 'long' })
  );
</script>

<div style="height: 100%; overflow: auto; padding-bottom: 24px;">
  <div style="padding: 0 18px 18px; display: flex; flex-direction: column; gap: 12px;">

    <div style="padding-top:16px;">
      <div style="font-size:13px;color:var(--mep-fg-3);">{$t(greeting)} · {dateStr}</div>
      <div class="title" style="margin-top:2px;">{$t('nav.hoy')}</div>
    </div>

    {#if nothingPending}
      <div class="card" style="padding:32px 20px;text-align:center;">
        <p class="body">{$t('rem.allEmpty')}</p>
      </div>
    {/if}

    {#if data.dashboard_alerts.length > 0}
      <div class="card" style="padding:10px;display:flex;flex-direction:column;gap:6px;">
        {#each data.dashboard_alerts as alert (alert.id)}
          <AlertRow {alert} />
        {/each}
      </div>
    {/if}

    {#if data.hoy_overdue.length || data.hoy_due_soon.length}
      <div class="card" style="padding:12px 14px 4px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            {#if data.hoy_overdue.length}
              <span class="badge badge-overdue">{data.hoy_overdue.length} {$t('rem.overdue').toLowerCase()}</span>
            {/if}
            <span class="body" style="font-size:11px;">{data.hoy_due_soon.length} {$t('rem.dueWeek').toLowerCase()}</span>
          </div>
          <span class="num text-fg" style="font-size:12.5px;font-weight:600;">{fmtEur(data.hoy_total_pending_amount)}</span>
        </div>
        {#each [...data.hoy_overdue, ...data.hoy_due_soon] as r (r.id)}
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--mep-divider);">
            <div style="flex:1;min-width:0;">
              <div class="body-strong overflow-hidden text-ellipsis whitespace-nowrap" style="font-size:12.5px;">{r.supplier_name ?? '—'}</div>
              {#if r.overdue}
                <span class="badge badge-overdue" style="margin-top:2px;">{Math.abs(r.days_delta)}{$t('rem.daysOverdue')}</span>
              {:else}
                <span class="badge badge-pending" style="margin-top:2px;">{r.days_delta}{$t('misc.daysLeft')}</span>
              {/if}
            </div>
            <span class="num text-fg" style="font-size:12.5px;font-weight:500;flex-shrink:0;">{fmtEur(r.display_amount ?? 0)}</span>
            <form method="post" action="?/markPaid" class="m-0 flex-shrink-0">
              <input type="hidden" name="invoiceId" value={r.id} />
              <button type="submit" class="btn btn-ghost text-pos" style="width:30px;height:30px;padding:0;justify-content:center;">
                <Check size={14} />
              </button>
            </form>
          </div>
        {/each}
      </div>
    {/if}

    {#each [
      { list: groups.priceShock,  title: $t('rem.priceShock'), category: false, product: false },
      { list: groups.lowStock,    title: $t('rem.lowStock'),   category: false, product: false },
      { list: groups.budget,      title: $t('rem.budget'),     category: false, product: false },
      { list: groups.suppliers,   title: $t('rem.suppliers'),  category: true,  product: false },
      { list: groups.other,       title: $t('rem.other'),      category: false, product: true },
    ] as group}
      {#if group.list.length}
        <div class="card" style="padding:12px 14px;">
          <div class="subtitle" style="font-size:13.5px;margin-bottom:8px;">{group.title}</div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            {#each group.list as n (n.id)}
              <NotificationItem
                notification={n}
                onDismiss={dismiss}
                onAcceptCategory={acceptCategory}
                onDecideProduct={decideProduct}
                decidingCategoryId={group.category ? decidingCategory : null}
                decidingProductId={group.product ? deciding : null}
              />
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    {#if data.pending_invoices.length > 0}
      <div class="card" style="padding: 14px 14px 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div class="subtitle" style="font-size: 15px;">{$t('ddash.toReview')}</div>
          <a href="/invoices" style="font-size: 12px; color: var(--mep-acc); font-weight: 500; text-decoration: none;">{$t('action.viewAll')}</a>
        </div>
        {#each data.pending_invoices.slice(0, 4) as inv, i}
          <a href="/invoice/{inv.id}" style="
            display: flex; align-items: center; gap: 10px;
            padding: 10px 0;
            border-bottom: {i < Math.min(data.pending_invoices.length, 4) - 1 ? '1px solid var(--mep-divider)' : 'none'};
            text-decoration: none;
          ">
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {inv.supplier_name ?? '—'}
              </div>
              <div class="num" style="font-size: 11.5px; color: var(--mep-fg-3);">
                {inv.invoice_number ?? '—'} · {fmtDate(inv.invoice_date, $locale)}
              </div>
            </div>
            <div class="num" style="font-size: 13.5px; font-weight: 600; color: var(--mep-fg);">
              {inv.display_amount != null ? fmtEur(inv.display_amount) : '—'}
            </div>
            <ChevronRight size={14} style="color: var(--mep-fg-3); flex-shrink: 0;" />
          </a>
        {/each}
      </div>
    {/if}

    {#if data.missing_invoices.length}
      <div class="card" style="padding:12px 14px;border-left:3px solid var(--mep-neg);">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <TriangleAlert size={13} class="text-neg flex-shrink-0" />
          <span class="subtitle text-neg" style="font-size:13px;">{$t('dash.missing')}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          {#each data.missing_invoices as m (m.supplier_name)}
            <div class="card p-2 bg-neg-soft border-neg">
              <p class="body-strong" style="font-size:12px;">{m.supplier_name}</p>
              <p class="body" style="font-size:10px;margin-top:1px;">{m.days_late}d · {m.frequency}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  </div>
</div>
