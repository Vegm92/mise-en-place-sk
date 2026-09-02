<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import NotificationItem from '$lib/components/mep/NotificationItem.svelte';
  import MobileAlerts from '$lib/components/mobile/MobileAlerts.svelte';
  import IncidenceKindBadge from '$lib/components/mep/IncidenceKindBadge.svelte';
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
    !data.incidencias.length && notifItems.length === 0
  );

  function paymentLine(method: string | null, iban: string | null): string | null {
    const label = method ? $t(`field.paymentMethod.${method}`) : null;
    const ibanShort = iban ? `${iban.slice(0, 4)} …` : null;
    if (label && ibanShort) return `${$t('rem.payBy')} ${label} · ${ibanShort}`;
    if (label) return `${$t('rem.payBy')} ${label}`;
    return ibanShort;
  }
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileAlerts
    incidencias={data.incidencias}
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

    {#if data.incidencias.length}
      <div class="flex gap-2 flex-wrap items-center" data-coach="reminders-main">
        <div class="card px-3 py-2 bg-neg-soft border-neg" style="font-size:13px;">
          <strong class="text-neg">{data.incidencias.length}</strong>
          <span class="text-fg-2"> {$t('rem.incidenciasCount')}</span>
        </div>
      </div>

      <SectionCard title={$t('rem.incidencias')} noPad>
        {#each data.incidencias as r (r.id)}
          <div class="grid items-center gap-3 px-4 py-3 border-b border-divider last:border-0 hover:bg-hover transition-colors"
            style="grid-template-columns:1fr 120px 100px auto auto;">
            <a href="/invoice/{r.id}" style="text-decoration:none;color:inherit;cursor:pointer;min-w-0;display:contents;">
              <div class="min-w-0">
              <p class="body-strong overflow-hidden text-ellipsis whitespace-nowrap">{r.supplier_name ?? '—'}</p>
              <p class="body text-fg-3" style="font-size:12px;margin-top:2px;">{r.invoice_number ?? '—'}</p>
              {#if paymentLine(r.payment_method, r.iban)}
                <p class="body text-fg-3" style="margin-top:2px;">{paymentLine(r.payment_method, r.iban)}</p>
              {/if}
            </div>
            <p class="num font-semibold text-right" style="font-size:13px;">{Math.round(r.display_amount)} EUR</p>
            <p class="body text-fg-3 text-right" style="font-size:12px;">{r.invoice_date ?? '—'}</p>
            <span class="flex items-center gap-1.5">
              <span class="badge badge-overdue">{$t('inv.review.incidencia')}</span>
              <IncidenceKindBadge kind={r.incidence_kind} />
            </span>
            </a>
            <form method="post" action="?/markReviewed">
              <input type="hidden" name="invoiceId" value={r.id} />
              <button type="submit" class="btn btn-ghost text-pos" style="height:28px;font-size:12px;gap:4px;">
                <Check size={12} />{$t('inv.markReviewed')}
              </button>
            </form>
          </div>
        {/each}
      </SectionCard>
    {:else}
      <p class="body text-fg-3" data-coach="reminders-main">{$t('rem.noIncidencias')}</p>
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
