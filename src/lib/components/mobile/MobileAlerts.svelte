<script lang="ts">
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import Clock from '@lucide/svelte/icons/clock';
  import Check from '@lucide/svelte/icons/check';
  import { t } from '$lib/i18n';
  import NotificationItem from '$lib/components/mep/NotificationItem.svelte';
  import { groupNotifications, type Notif } from '$lib/notification-display';

  interface Reminder {
    id: number;
    supplier_name: string | null;
    invoice_number: string | null;
    display_amount: number;
    due_date: string | null;
    days_delta: number;
  }

  type NotifGroups = ReturnType<typeof groupNotifications>;

  let {
    overdue,
    due_soon,
    total_amount,
    groups,
    onDismiss,
    onAcceptCategory,
    onDecideProduct,
    decidingCategory = null,
    deciding = null,
  }: {
    overdue: Reminder[];
    due_soon: Reminder[];
    total_amount: number;
    groups: NotifGroups;
    onDismiss: (id: number) => void;
    onAcceptCategory: (n: Notif) => void;
    onDecideProduct: (n: Notif, accept: boolean) => void;
    decidingCategory?: number | null;
    deciding?: number | null;
  } = $props();

  function fmtAmount(n: number) {
    return Math.round(n).toLocaleString('es-ES') + ' EUR';
  }

  const notifGroupList = $derived([
    { key: 'priceShock', title: $t('rem.priceShock'), items: groups.priceShock },
    { key: 'lowStock',   title: $t('rem.lowStock'),   items: groups.lowStock },
    { key: 'budget',     title: $t('rem.budget'),     items: groups.budget },
    { key: 'suppliers',  title: $t('rem.suppliers'),  items: groups.suppliers },
    { key: 'other',      title: $t('rem.other'),      items: groups.other },
  ] as const);

  const nothingPending = $derived(
    !overdue.length && !due_soon.length && notifGroupList.every((g) => g.items.length === 0)
  );
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 14px;">

    {#if nothingPending}
      <div style="padding: 48px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        {$t('rem.allEmpty')}
      </div>
    {:else}

      {#if overdue.length || due_soon.length}
        <div style="display: flex; gap: 8px; flex-wrap: wrap; padding-top: 4px;">
          {#if overdue.length}
            <div style="padding: 6px 12px; border-radius: 8px; background: var(--mep-neg-soft); font-size: 12.5px;">
              <strong style="color: var(--mep-neg);">{overdue.length}</strong>
              <span style="color: var(--mep-fg-2);"> {$t('malert.overdueCount')}</span>
            </div>
          {/if}
          {#if due_soon.length}
            <div class="card" style="padding: 6px 12px; font-size: 12.5px;">
              <strong style="color: var(--mep-fg);">{due_soon.length}</strong>
              <span style="color: var(--mep-fg-2);"> {$t('malert.dueWeekCount')}</span>
            </div>
          {/if}
          <div class="card" style="padding: 6px 12px; font-size: 12.5px;">
            <span style="color: var(--mep-fg-2);">{$t('tbl.total')}: </span>
            <strong class="num" style="color: var(--mep-fg);">{fmtAmount(total_amount)}</strong>
          </div>
        </div>
      {/if}

      {#if overdue.length}
        <div>
          <div style="font-size: 11.5px; color: var(--mep-neg); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <AlertTriangle size={13} /> {$t('rem.overdue')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            {#each overdue as r}
              <div class="card" style="padding: 12px 14px; background: var(--mep-neg-soft);">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      {r.supplier_name ?? '—'}
                    </div>
                    <div class="num" style="font-size: 11.5px; color: var(--mep-fg-3); margin-top: 2px;">
                      {r.invoice_number ?? '—'}
                    </div>
                  </div>
                  <div style="text-align: right; flex-shrink: 0;">
                    <div class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">{fmtAmount(r.display_amount)}</div>
                    <span class="badge badge-overdue" style="font-size: 9.5px;">{Math.abs(r.days_delta)}{$t('malert.dOverdue')}</span>
                  </div>
                </div>
                <form method="post" action="?/markPaid" style="margin-top: 10px;">
                  <input type="hidden" name="invoiceId" value={r.id} />
                  <button type="submit" class="btn btn-ghost" style="height: 30px; font-size: 12px; gap: 4px; width: 100%; justify-content: center; color: var(--mep-pos);">
                    <Check size={12} /> {$t('malert.markPaid')}
                  </button>
                </form>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if due_soon.length}
        <div>
          <div style="font-size: 11.5px; color: var(--mep-warn); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <Clock size={13} /> {$t('rem.dueWeek')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            {#each due_soon as r}
              <div class="card" style="padding: 12px 14px;">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      {r.supplier_name ?? '—'}
                    </div>
                    <div class="num" style="font-size: 11.5px; color: var(--mep-fg-3); margin-top: 2px;">
                      {r.invoice_number ?? '—'}
                    </div>
                  </div>
                  <div style="text-align: right; flex-shrink: 0;">
                    <div class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">{fmtAmount(r.display_amount)}</div>
                    <span class="badge badge-pending" style="font-size: 9.5px;">{r.days_delta}{$t('malert.dLeft')}</span>
                  </div>
                </div>
                <form method="post" action="?/markPaid" style="margin-top: 10px;">
                  <input type="hidden" name="invoiceId" value={r.id} />
                  <button type="submit" class="btn btn-ghost" style="height: 30px; font-size: 12px; gap: 4px; width: 100%; justify-content: center; color: var(--mep-pos);">
                    <Check size={12} /> {$t('malert.markPaid')}
                  </button>
                </form>
              </div>
            {/each}
          </div>
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
