<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import FileText from '@lucide/svelte/icons/file-text';
  import Plus from '@lucide/svelte/icons/plus';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Bell from '@lucide/svelte/icons/bell';

  let { alertBadge = 0, invBadge = 0 }: { alertBadge?: number; invBadge?: number } = $props();

  const p = $derived($page.url.pathname);
  const is = (path: string) => p === path || p.startsWith(path + '/');
</script>

<nav class="md:hidden flex items-end justify-around" style="
  position: fixed; bottom: 0; left: 0; right: 0;
  padding-top: 8px; padding-bottom: 20px;
  background: var(--mep-surface);
  border-top: 1px solid var(--mep-divider);
  z-index: 50;
">
  <a href="/dashboard" style="
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    color: {is('/dashboard') ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};
    text-decoration: none; padding: 4px 6px; min-width: 50px;
  ">
    <LayoutDashboard size={20} strokeWidth={is('/dashboard') ? 2 : 1.7} />
    <span style="font-size: 10.5px; font-weight: {is('/dashboard') ? 600 : 500};">{$t('nav.dashboard')}</span>
  </a>

  <a href="/invoices" style="
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    color: {is('/invoices') ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};
    text-decoration: none; padding: 4px 6px; min-width: 50px; position: relative;
  ">
    <div style="position: relative;">
      <FileText size={20} strokeWidth={is('/invoices') ? 2 : 1.7} />
      {#if invBadge > 0}
        <span class="num" style="
          position: absolute; top: -4px; right: -8px;
          min-width: 14px; height: 14px; padding: 0 4px;
          border-radius: 7px; font-size: 9px; font-weight: 700;
          background: var(--mep-warn); color: var(--mep-warn-fg);
          display: inline-flex; align-items: center; justify-content: center;
        ">{invBadge}</span>
      {/if}
    </div>
    <span style="font-size: 10.5px; font-weight: {is('/invoices') ? 600 : 500};">{$t('nav.invoices')}</span>
  </a>

  <a href="/" style="
    position: relative; top: -18px;
    width: 54px; height: 54px; border-radius: 27px;
    background: var(--mep-acc); color: var(--mep-acc-fg);
    display: flex; align-items: center; justify-content: center;
    text-decoration: none;
    box-shadow: 0 6px 16px rgba(184,116,26,0.40), 0 2px 4px rgba(0,0,0,0.10);
  " aria-label={$t('action.upload')}>
    <Plus size={22} strokeWidth={2} />
  </a>

  <a href="/analytics/spend" style="
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    color: {is('/analytics') ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};
    text-decoration: none; padding: 4px 6px; min-width: 50px;
  ">
    <TrendingUp size={20} strokeWidth={is('/analytics') ? 2 : 1.7} />
    <span style="font-size: 10.5px; font-weight: {is('/analytics') ? 600 : 500};">{$t('nav.analytics')}</span>
  </a>

  <a href="/reminders" style="
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    color: {is('/reminders') ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};
    text-decoration: none; padding: 4px 6px; min-width: 50px; position: relative;
  ">
    <div style="position: relative;">
      <Bell size={20} strokeWidth={is('/reminders') ? 2 : 1.7} />
      {#if alertBadge > 0}
        <span class="num" style="
          position: absolute; top: -4px; right: -8px;
          min-width: 14px; height: 14px; padding: 0 4px;
          border-radius: 7px; font-size: 9px; font-weight: 700;
          background: var(--mep-neg); color: var(--mep-neg-fg);
          display: inline-flex; align-items: center; justify-content: center;
        ">{alertBadge}</span>
      {/if}
    </div>
    <span style="font-size: 10.5px; font-weight: {is('/reminders') ? 600 : 500};">{$t('notif.title')}</span>
  </a>
</nav>
