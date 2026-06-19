<script lang="ts">
  import Bell from '@lucide/svelte/icons/bell';
  import X from '@lucide/svelte/icons/x';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Package from '@lucide/svelte/icons/package';
  import Ruler from '@lucide/svelte/icons/ruler';
  import { t } from '$lib/i18n';

  type Notif = {
    id: number;
    notificationType: string;
    message: string;
    payload: unknown;
    createdAt: Date | null;
  };

  let { notifications: initial }: { notifications: Notif[] } = $props();

  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let items = $state<Notif[]>(initial);
  let open = $state(false);

  const count = $derived(items.length);

  function icon(type: string) {
    if (type === 'price_shock')            return TrendingUp;
    if (type === 'low_stock_forecast')     return Package;
    if (type === 'unit_conversion_needed') return Ruler;
    return Bell;
  }

  function color(type: string) {
    if (type === 'price_shock')            return 'var(--mep-neg)';
    if (type === 'low_stock_forecast')     return 'var(--mep-warn)';
    if (type === 'unit_conversion_needed') return 'var(--mep-info)';
    return 'var(--mep-fg-2)';
  }

  async function dismiss(id: number) {
    items = items.filter((n) => n.id !== id);
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
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
    aria-label={$t('a11y.notifications')}
  >
    <Bell size={15} />
    {#if count > 0}
      <span
        style="
          position:absolute;top:4px;right:4px;
          min-width:14px;height:14px;border-radius:7px;
          background:var(--mep-neg);color:#fff;
          font-size:9px;font-weight:700;
          display:flex;align-items:center;justify-content:center;
          padding:0 3px;line-height:1;
        "
      >{count > 9 ? '9+' : count}</span>
    {/if}
  </button>

  {#if open}
    <!-- backdrop -->
    <div
      style="position:fixed;inset:0;z-index:199;"
      onclick={close}
      role="presentation"
    ></div>

    <!-- dropdown -->
    <div
      style="
        position:absolute;top:calc(100% + 6px);right:0;z-index:200;
        width:320px;max-height:420px;overflow-y:auto;
        background:var(--mep-surface);border:1px solid var(--mep-divider);
        border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);
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
        {#each items as n (n.id)}
          {@const Ic = icon(n.notificationType)}
          <div
            style="
              display:flex;align-items:flex-start;gap:10px;
              padding:10px 14px;border-bottom:1px solid var(--mep-divider);
            "
          >
            <div style="flex-shrink:0;margin-top:1px;color:{color(n.notificationType)};">
              <Ic size={14} />
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;color:var(--mep-fg);line-height:1.4;">{n.message}</div>
              {#if n.createdAt}
                <div style="font-size:11px;color:var(--mep-fg-3);margin-top:2px;">
                  {new Date(n.createdAt).toLocaleDateString()}
                </div>
              {/if}
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
    </div>
  {/if}
</div>
