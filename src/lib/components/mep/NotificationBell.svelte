<script lang="ts">
  import Bell from '@lucide/svelte/icons/bell';
  import { t, tiv } from '$lib/i18n';
  import NotificationItem from '$lib/components/mep/NotificationItem.svelte';
  import type { Notif } from '$lib/notification-display';
  import { dismissNotification, acceptSupplierCategory, decideProductSuggestion } from '$lib/notification-actions';

  let { notifications: initial }: { notifications: Notif[] } = $props();

  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let items = $state<Notif[]>(initial);
  let open = $state(false);
  let decidingCategory = $state<number | null>(null);
  let deciding = $state<number | null>(null);

  const count = $derived(items.length);
  const preview = $derived(items.slice(0, 5));

  function dismiss(id: number) {
    return dismissNotification(items, id, (next) => { items = next; });
  }

  async function acceptCategory(n: Notif) {
    if (decidingCategory !== null) return;
    decidingCategory = n.id;
    try {
      if (await acceptSupplierCategory(n)) items = items.filter((i) => i.id !== n.id);
    } finally {
      decidingCategory = null;
    }
  }

  async function decideProduct(n: Notif, accept: boolean) {
    if (deciding !== null) return;
    deciding = n.id;
    try {
      if (await decideProductSuggestion(n, accept)) items = items.filter((i) => i.id !== n.id);
    } finally {
      deciding = null;
    }
  }

  function toggleOpen() { open = !open; }
  function close() { open = false; }
</script>

<div style="position:relative;">
  <button
    class="btn btn-ghost"
    style="width:34px;height:34px;padding:0;justify-content:center;position:relative;"
    onclick={toggleOpen}
    title={$t('a11y.notifications')}
    aria-label={count > 0 ? $tiv('a11y.notificationsCount', { n: count > 9 ? '9+' : count }) : $t('a11y.notifications')}
  >
    <Bell size={15} />
    {#if count > 0}
      <span
        style="
          position:absolute;top:4px;right:4px;
          min-width:14px;height:14px;border-radius:7px;
          background:var(--mep-neg);color:var(--mep-neg-fg);
          font-size:11px;font-weight:700;
          display:flex;align-items:center;justify-content:center;
          padding:0 3px;line-height:1;
        "
      >{count > 9 ? '9+' : count}</span>
    {/if}
  </button>

  {#if open}
    <div
      style="position:fixed;inset:0;z-index:199;"
      onclick={close}
      role="presentation"
    ></div>

    <div
      style="
        position:absolute;top:calc(100% + 6px);right:0;z-index:200;
        width:320px;max-height:420px;overflow-y:auto;
        background:var(--mep-surface);border:1px solid var(--mep-divider);
        border-radius:var(--mep-r-card);box-shadow:var(--mep-shadow-pop);
        display:flex;flex-direction:column;
      "
    >
      <div style="padding:12px 14px 8px;border-bottom:1px solid var(--mep-divider);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;font-weight:600;color:var(--mep-fg);">{$t('notif.title')}</span>
        {#if count > 0}
          <button
            style="font-size:11px;color:var(--mep-fg-3);background:none;border:none;cursor:pointer;padding:0;"
            onclick={async () => { for (const n of [...items]) await dismiss(n.id); }}
          >{$t('notif.clearAll')}</button>
        {/if}
      </div>

      {#if items.length === 0}
        <div style="padding:24px 14px;text-align:center;color:var(--mep-fg-3);font-size:13px;">
          {$t('notif.empty')}
        </div>
      {:else}
        {#each preview as n (n.id)}
          <div style="padding:10px 14px;border-bottom:1px solid var(--mep-divider);">
            <NotificationItem
              notification={n}
              onDismiss={dismiss}
              onAcceptCategory={acceptCategory}
              onDecideProduct={decideProduct}
              decidingCategoryId={decidingCategory}
              decidingProductId={deciding}
            />
          </div>
        {/each}
      {/if}

      <a
        href="/reminders"
        onclick={close}
        style="
          padding:10px 14px;text-align:center;font-size:12px;font-weight:600;
          color:var(--mep-acc);text-decoration:none;border-top:1px solid var(--mep-divider);
        "
      >{$t('action.allAlerts')}</a>
    </div>
  {/if}
</div>
