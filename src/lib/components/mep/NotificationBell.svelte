<script lang="ts">
  import Bell from '@lucide/svelte/icons/bell';
  import X from '@lucide/svelte/icons/x';
  import { t, tiv } from '$lib/i18n';
  import { notificationIcon, notificationColor, type Notif } from '$lib/notification-display';

  let { notifications: initial }: { notifications: Notif[] } = $props();

  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let items = $state<Notif[]>(initial);
  let open = $state(false);

  const count = $derived(items.length);
  const preview = $derived(items.slice(0, 5));

  async function dismiss(id: number) {
    const removed = items.find((n) => n.id === id);
    const removedIndex = items.findIndex((n) => n.id === id);
    items = items.filter((n) => n.id !== id);
    try {
      const resp = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!resp.ok) throw new Error(`dismiss failed: ${resp.status}`);
    } catch {
      if (removed && removedIndex >= 0) {
        const next = [...items];
        next.splice(removedIndex, 0, removed);
        items = next;
      }
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
        border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);
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
          {@const Ic = notificationIcon(n.notificationType)}
          {@const msg = n.payload as { messageKey?: string; messageVars?: Record<string, string | number> } | null}
          <div
            style="
              display:flex;align-items:flex-start;gap:10px;
              padding:10px 14px;border-bottom:1px solid var(--mep-divider);
            "
          >
            <div style="flex-shrink:0;margin-top:1px;color:{notificationColor(n.notificationType)};">
              <Ic size={14} />
            </div>
            <div style="flex:1;min-width:0;font-size:12.5px;color:var(--mep-fg);line-height:1.4;">
              {msg?.messageKey ? $tiv(msg.messageKey, msg.messageVars ?? {}) : n.message}
            </div>
            <button
              style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--mep-fg-3);padding:2px;margin-top:-1px;"
              onclick={() => dismiss(n.id)}
              aria-label={$t('a11y.dismiss')}
            >
              <X size={12} />
            </button>
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
