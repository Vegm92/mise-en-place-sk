<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import NotificationItem from '$lib/components/mep/NotificationItem.svelte';
  import MobileAlerts from '$lib/components/mobile/MobileAlerts.svelte';
  import Check from '@lucide/svelte/icons/check';
  import { groupNotifications, type Notif } from '$lib/notification-display';

  let { data }: { data: PageData } = $props();

  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let notifItems = $state<Notif[]>(data.notifications as Notif[]);
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
    const p = n.payload as { description?: string; candidateProductId?: number } | null;
    const description = p?.description;
    if (!description || deciding !== null) return;
    const bodyObj: Record<string, unknown> = { description };
    if (accept) {
      bodyObj.action = 'confirm';
      if (typeof p?.candidateProductId === 'number') bodyObj.targetProductId = p.candidateProductId;
    } else {
      bodyObj.action = 'dismiss';
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
    !data.overdue.length && !data.due_soon.length && notifItems.length === 0
  );
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileAlerts
    overdue={data.overdue}
    due_soon={data.due_soon}
    total_amount={data.total_amount}
    {groups}
    onDismiss={dismiss}
    onAcceptCategory={acceptCategory}
    onDecideProduct={decideProduct}
    {decidingCategory}
    {deciding}
  />
</div>

<div class="hidden md:flex flex-col gap-4 p-6">

  {#if data.conflict}
    <div class="card p-3 text-neg" role="alert" style="font-size:13px;">{$t('inv.conflict')}</div>
  {/if}

  {#if nothingPending}
    <p class="body text-center py-16" data-coach="reminders-main">{$t('rem.allEmpty')}</p>
  {:else}

    {#if data.overdue.length || data.due_soon.length}
      <div class="flex gap-2 flex-wrap items-center" data-coach="reminders-main">
        {#if data.overdue.length}
          <div class="card px-3 py-2 bg-neg-soft border-neg" style="font-size:13px;">
            <strong class="text-neg">{data.overdue.length}</strong>
            <span class="text-fg-2"> {$t('rem.overdue').toLowerCase()}</span>
          </div>
        {/if}
        <div class="card px-3 py-2" style="font-size:13px;">
          <strong class="text-fg">{data.due_soon.length}</strong>
          <span class="text-fg-2"> {$t('rem.dueWeek').toLowerCase()}</span>
        </div>
        <div class="card px-3 py-2" style="font-size:13px;">
          <span class="text-fg-2">{$t('rem.totalPending')}:</span>
          <strong class="text-fg num"> {Math.round(data.total_amount)} EUR</strong>
        </div>

        <form method="post" action="?/bulkPaid" class="ml-auto">
          {#each [...data.overdue, ...data.due_soon] as r (r.id)}
            <input type="hidden" name="invoice_ids" value={r.id} />
          {/each}
          <button type="submit" class="btn btn-ghost text-pos" style="height:32px;font-size:12px;gap:4px;">
            <Check size={12} />{$t('rem.markAllPaid')}
          </button>
        </form>
      </div>
    {/if}

    {#if data.overdue.length}
      <SectionCard title={$t('rem.overdue')} noPad>
        {#each data.overdue as r (r.id)}
          <div class="grid items-center gap-3 px-4 py-3 border-b border-divider last:border-0 hover:bg-hover transition-colors"
            style="grid-template-columns:1fr 120px 100px auto auto;">
            <a href="/invoice/{r.id}" style="text-decoration:none;color:inherit;cursor:pointer;min-w-0;display:contents;">
              <div class="min-w-0">
              <p class="body-strong overflow-hidden text-ellipsis whitespace-nowrap">{r.supplier_name ?? '—'}</p>
              <p class="body text-fg-3" style="font-size:12px;margin-top:2px;">{r.invoice_number ?? '—'}</p>
            </div>
            <p class="num font-semibold text-right" style="font-size:13px;">{Math.round(r.display_amount)} EUR</p>
            <p class="body text-fg-3 text-right" style="font-size:12px;">{r.due_date}</p>
            <span class="badge badge-overdue">{Math.abs(r.days_delta)}{$t('rem.daysOverdue')}</span>
            </a>
            <form method="post" action="?/markPaid">
              <input type="hidden" name="invoiceId" value={r.id} />
              <button type="submit" class="btn btn-ghost text-pos" style="height:28px;font-size:12px;gap:4px;">
                <Check size={12} />{$t('inv.markPaid')}
              </button>
            </form>
          </div>
        {/each}
      </SectionCard>
    {/if}

    {#if data.due_soon.length}
      <SectionCard title={$t('rem.dueWeek')} noPad>
        {#each data.due_soon as r (r.id)}
          <div class="grid items-center gap-3 px-4 py-3 border-b border-divider last:border-0 hover:bg-hover transition-colors"
            style="grid-template-columns:1fr 120px 100px auto auto;">
            <a href="/invoice/{r.id}" style="text-decoration:none;color:inherit;cursor:pointer;min-w-0;display:contents;">
              <div class="min-w-0">
              <p class="body-strong overflow-hidden text-ellipsis whitespace-nowrap">{r.supplier_name ?? '—'}</p>
              <p class="body text-fg-3" style="font-size:12px;margin-top:2px;">{r.invoice_number ?? '—'}</p>
            </div>
            <p class="num font-semibold text-right" style="font-size:13px;">{Math.round(r.display_amount)} EUR</p>
            <p class="body text-fg-3 text-right" style="font-size:12px;">{r.due_date}</p>
            <span class="badge badge-pending">{r.days_delta}{$t('misc.daysLeft')}</span>
            </a>
            <form method="post" action="?/markPaid">
              <input type="hidden" name="invoiceId" value={r.id} />
              <button type="submit" class="btn btn-ghost text-pos" style="height:28px;font-size:12px;gap:4px;">
                <Check size={12} />{$t('inv.markPaid')}
              </button>
            </form>
          </div>
        {/each}
      </SectionCard>
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

  {/if}
</div>
