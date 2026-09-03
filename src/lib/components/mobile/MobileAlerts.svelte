<script lang="ts">
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import Check from '@lucide/svelte/icons/check';
  import { locale, t } from '$lib/i18n';
  import { fmtEurCompact } from '$lib/formatters';
  import NotificationItem from '$lib/components/mep/NotificationItem.svelte';
  import IncidenceKindBadge from '$lib/components/mep/IncidenceKindBadge.svelte';
  import { groupNotifications, type Notif } from '$lib/notification-display';

  interface Incidencia {
    id: number;
    supplier_name: string | null;
    invoice_number: string | null;
    display_amount: number;
    invoice_date: string | null;
    incidence_kind: string | null;
    payment_method: string | null;
    iban: string | null;
  }

  type NotifGroups = ReturnType<typeof groupNotifications>;

  let {
    incidencias,
    groups,
    onDismiss,
    onAcceptCategory,
    onDecideProduct,
    decidingCategory = null,
    deciding = null,
  }: {
    incidencias: Incidencia[];
    groups: NotifGroups;
    onDismiss: (id: number) => void;
    onAcceptCategory: (n: Notif) => void;
    onDecideProduct: (n: Notif, accept: boolean) => void;
    decidingCategory?: number | null;
    deciding?: number | null;
  } = $props();

  function fmtAmount(n: number) {
    return fmtEurCompact(n, $locale);
  }

  function paymentLine(method: string | null, iban: string | null): string | null {
    const label = method ? $t(`field.paymentMethod.${method}`) : null;
    const ibanShort = iban ? `${iban.slice(0, 4)} …` : null;
    if (label && ibanShort) return `${$t('rem.payBy')} ${label} · ${ibanShort}`;
    if (label) return `${$t('rem.payBy')} ${label}`;
    return ibanShort;
  }

  const notifGroupList = $derived([
    { key: 'priceShock', title: $t('rem.priceShock'), items: groups.priceShock },
    { key: 'lowStock',   title: $t('rem.lowStock'),   items: groups.lowStock },
    { key: 'budget',     title: $t('rem.budget'),     items: groups.budget },
    { key: 'suppliers',  title: $t('rem.suppliers'),  items: groups.suppliers },
    { key: 'other',      title: $t('rem.other'),      items: groups.other },
  ] as const);

  const nothingPending = $derived(
    !incidencias.length && notifGroupList.every((g) => g.items.length === 0)
  );
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 14px;">

    {#if nothingPending}
      <div style="padding: 48px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        {$t('rem.allEmpty')}
      </div>
    {:else}

      {#if incidencias.length}
        <div>
          <div style="font-size: 11.5px; color: var(--mep-neg); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <AlertTriangle size={13} /> {$t('rem.incidencias')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            {#each incidencias as r (r.id)}
              <div class="card" style="padding: 12px 14px; background: var(--mep-neg-soft);">
                <a href="/invoice/{r.id}" style="text-decoration:none;color:inherit;cursor:pointer;display:block;">
                  <div style="display: flex; align-items: flex-start; gap: 12px;">
                    <div style="flex: 1; min-width: 0;">
                      <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        {r.supplier_name ?? '—'}
                      </div>
                      <div class="num" style="font-size: 11.5px; color: var(--mep-fg-3); margin-top: 2px;">
                        {r.invoice_number ?? '—'}
                      </div>
                      {#if paymentLine(r.payment_method, r.iban)}
                        <div class="text-fg-3" style="font-size: 11px; margin-top: 2px;">
                          {paymentLine(r.payment_method, r.iban)}
                        </div>
                      {/if}
                    </div>
                    <div style="text-align: right; flex-shrink: 0; max-width: 130px;">
                      <div class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">{fmtAmount(r.display_amount)}</div>
                      <span class="badge badge-overdue">{$t('inv.review.incidencia')}</span>
                      <div class="mt-0.5">
                        <IncidenceKindBadge kind={r.incidence_kind} small hint />
                      </div>
                    </div>
                  </div>
                </a>
                <form method="post" action="?/markReviewed" style="margin-top: 10px;">
                  <input type="hidden" name="invoiceId" value={r.id} />
                  <button type="submit" class="btn btn-ghost" style="height: 30px; font-size: 12px; gap: 4px; width: 100%; justify-content: center; color: var(--mep-pos);">
                    <Check size={12} /> {$t('inv.markReviewed')}
                  </button>
                </form>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div style="font-size: 13px; color: var(--mep-fg-3); padding: 4px 0;">
          {$t('rem.noIncidencias')}
        </div>
      {/if}

      {#each notifGroupList as group (group.key)}
        {#if group.items.length}
          <div>
            <div style="font-size: 11.5px; color: var(--mep-fg-3); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-bottom: 8px;">
              {group.title}
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              {#each group.items as n (n.id)}
                <div class="card" style="padding: 12px 14px;">
                  <NotificationItem
                    notification={n}
                    {onDismiss}
                    {onAcceptCategory}
                    {onDecideProduct}
                    decidingCategoryId={decidingCategory}
                    decidingProductId={deciding}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}

    {/if}
  </div>
</div>
