<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import {
    LayoutDashboard, FileText, Truck, TrendingUp, Tag, Bell,
    Settings, HelpCircle, Upload, Sun, Moon,
    LogOut, Menu, X, MessageCircle,
  } from 'lucide-svelte';
  import { locale, t, initLocale } from '$lib/i18n';
  import ChatFab from '$lib/components/mep/ChatFab.svelte';
  import NotificationBell from '$lib/components/mep/NotificationBell.svelte';

  const { children, data } = $props();

  const p = $derived($page.url.pathname);
  const is = (path: string) => p === path || p.startsWith(path + '/');

  let theme = $state<'light' | 'dark'>(
    browser ? ((document.documentElement.dataset.theme as 'light' | 'dark') || 'light') : 'light'
  );
  let mobileOpen = $state(false);

  onMount(() => {
    const storedTheme = localStorage.getItem('mep-theme') as 'light' | 'dark' | null;
    if (storedTheme && storedTheme !== theme) theme = storedTheme;
    initLocale();
    const close = () => { mobileOpen = false; };
    document.addEventListener('sveltekit:navigation-start', close);
    return () => document.removeEventListener('sveltekit:navigation-start', close);
  });

  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('mep-theme', theme);
    document.documentElement.dataset.theme = theme;
  }

  function toggleLocale() {
    locale.update(l => l === 'es' ? 'en' : 'es');
  }

  const navItems = $derived([
    { href: '/dashboard',       icon: LayoutDashboard, label: $t('nav.dashboard'),  badge: 0 },
    { href: '/invoices',        icon: FileText,        label: $t('nav.invoices'),   badge: data.invoiceBadge },
    { href: '/suppliers',       icon: Truck,           label: $t('nav.suppliers'),  badge: 0 },
    { href: '/analytics/spend', icon: TrendingUp,      label: $t('nav.analytics'),  badge: 0,
      sub: [
        { href: '/analytics/spend',  label: $t('nav.analytics.spend') },
        { href: '/analytics/prices', label: $t('nav.analytics.prices') },
      ]
    },
    { href: '/budgets',         icon: Tag,             label: $t('nav.budgets'),    badge: 0 },
    { href: '/reminders',       icon: Bell,            label: $t('nav.reminders'),  badge: data.reminderBadge },
    { href: '/chat',            icon: MessageCircle,   label: $t('nav.chat'),       badge: 0 },
  ]);

  const pageTitle = $derived($page.data.title ?? 'Mise en Place');
  const userName  = $derived(data?.user?.name ?? 'Usuario');
  const userInitials = $derived(
    userName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
  style="width:100%;height:100vh;display:flex;overflow:hidden;">

  <!-- Mobile overlay -->
  {#if mobileOpen}
    <div
      class="fixed inset-0 z-[99] bg-black/60 md:hidden"
      onclick={() => mobileOpen = false}
      role="presentation"
    ></div>
  {/if}

  <!-- ── Sidebar ──────────────────────────────────────────────────── -->
  <aside
    style="
      width:232px;height:100%;flex-shrink:0;
      background:var(--mep-surface);
      border-right:1px solid var(--mep-divider);
      display:flex;flex-direction:column;
      padding:20px 12px 16px;
      overflow-y:auto;
    "
    class="
      max-md:fixed max-md:left-0 max-md:top-0 max-md:bottom-0 max-md:h-full max-md:z-[100]
      max-md:transition-transform max-md:duration-200
      {mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}
    "
  >
    <!-- Brand -->
    <div style="display:flex;align-items:center;gap:10px;padding:0 10px 22px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="color:var(--mep-acc);flex-shrink:0;">
        <rect x="2.5"  y="3.5" width="3" height="17" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
        <rect x="10.5" y="3.5" width="3" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
        <rect x="18.5" y="3.5" width="3" height="9"  rx="1.2" stroke="currentColor" stroke-width="1.6"/>
      </svg>
      <span style="font-size:15px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">
        Mise en Place
      </span>
    </div>

    <!-- Upload CTA (desktop primary action) -->
    <a
      href="/"
      onclick={() => mobileOpen = false}
      class="btn btn-primary"
      style="height:38px;justify-content:center;margin-bottom:20px;width:100%;text-decoration:none;"
    >
      <Upload size={15} />
      <span>{$t('action.upload')}</span>
    </a>

    <!-- Primary nav -->
    <nav style="display:flex;flex-direction:column;gap:1px;">
      {#each navItems as item}
        {@const parentActive = is(item.href) || (item.sub?.some(s => is(s.href)) ?? false)}
        <a
          href={item.href}
          onclick={() => mobileOpen = false}
          style="
            display:flex;align-items:center;gap:10px;
            padding:7px 10px;height:32px;border-radius:6px;
            cursor:pointer;text-decoration:none;
            background:{parentActive ? 'var(--mep-acc-soft)' : 'transparent'};
            color:{parentActive ? 'var(--mep-acc)' : 'var(--mep-fg-2)'};
            font-size:13.5px;font-weight:{parentActive ? 500 : 400};
          "
        >
          <item.icon size={16} />
          <span style="flex:1;">{item.label}</span>
          {#if item.badge}
            <span
              class="num"
              style="
                font-size:10px;font-weight:600;min-width:16px;height:16px;
                padding:0 5px;border-radius:8px;
                background:{parentActive ? 'var(--mep-acc)' : 'var(--mep-warn-soft)'};
                color:{parentActive ? 'var(--mep-acc-fg)' : 'var(--mep-warn)'};
                display:inline-flex;align-items:center;justify-content:center;
              "
            >{item.badge}</span>
          {/if}
        </a>

        {#if item.sub && (is(item.href) || (item.sub?.some(s => is(s.href)) ?? false))}
          <div style="margin-left:32px;margin-top:1px;margin-bottom:4px;padding-left:10px;border-left:1px solid var(--mep-divider);display:flex;flex-direction:column;">
            {#each item.sub as sub}
              <a
                href={sub.href}
                onclick={() => mobileOpen = false}
                style="
                  padding:5px 10px;border-radius:5px;text-decoration:none;
                  font-size:12.5px;
                  color:{is(sub.href) ? 'var(--mep-fg)' : 'var(--mep-fg-2)'};
                  font-weight:{is(sub.href) ? 500 : 400};
                  background:{is(sub.href) ? 'var(--mep-hover)' : 'transparent'};
                "
              >{sub.label}</a>
            {/each}
          </div>
        {/if}
      {/each}
    </nav>

    <div style="flex:1;"></div>

    <!-- Quota widget -->
    <div style="margin:0 4px 14px;padding:12px;border-radius:8px;background:var(--mep-surface-2);border:1px solid var(--mep-divider);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:500;color:var(--mep-fg-2);">{data.planName}</span>
        <span class="num" style="font-size:11px;color:var(--mep-fg-3);">{data.quotaUsed}/{data.quotaLimit}</span>
      </div>
      <div style="height:4px;border-radius:2px;background:var(--mep-divider);overflow:hidden;">
        <div style="width:{Math.round(data.quotaUsed / data.quotaLimit * 100)}%;height:100%;background:var(--mep-acc);border-radius:2px;"></div>
      </div>
      <div style="font-size:11px;color:var(--mep-fg-3);margin-top:6px;">{$t('shell.quota')}</div>
    </div>

    <!-- Util links -->
    <div style="display:flex;flex-direction:column;gap:1px;">
      <a
        href="/settings"
        onclick={() => mobileOpen = false}
        style="display:flex;align-items:center;gap:10px;padding:6px 10px;height:30px;border-radius:6px;color:var(--mep-fg-3);font-size:13px;text-decoration:none;"
      >
        <Settings size={15} />
        <span>{$t('nav.settings')}</span>
      </a>
      <button
        style="display:flex;align-items:center;gap:10px;padding:6px 10px;height:30px;border-radius:6px;color:var(--mep-fg-3);font-size:13px;background:transparent;border:none;cursor:pointer;width:100%;text-align:left;"
      >
        <HelpCircle size={15} />
        <span>{$t('nav.help')}</span>
      </button>
    </div>

    <!-- User chip -->
    <div style="margin-top:10px;padding:8px;display:flex;align-items:center;gap:10px;border-radius:8px;">
      <div style="width:28px;height:28px;border-radius:14px;flex-shrink:0;background:linear-gradient(135deg,#b8741a,#7a3a4a);color:#fff;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;">
        {userInitials}
      </div>
      <div style="min-width:0;flex:1;">
        <div style="font-size:12.5px;font-weight:500;color:var(--mep-fg);line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          {userName}
        </div>
        <div style="font-size:11px;color:var(--mep-fg-3);">{data.restaurantName}</div>
      </div>
      <form method="POST" action="/logout" style="flex-shrink:0;">
        <button
          type="submit"
          title={$t('action.logout')}
          style="background:transparent;border:none;cursor:pointer;color:var(--mep-fg-3);display:flex;align-items:center;padding:2px;border-radius:4px;"
        >
          <LogOut size={13} />
        </button>
      </form>
    </div>
  </aside>

  <!-- ── Main area ─────────────────────────────────────────────────── -->
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--mep-bg);">

    <!-- TopBar — universal header (mobile + desktop) -->
    <header style="height:56px;flex-shrink:0;display:flex;align-items:center;padding:0 16px;gap:10px;border-bottom:1px solid var(--mep-divider);background:var(--mep-bg);">

      <!-- Mobile hamburger (kept for fallback pages not yet mobilised) -->
      <button
        class="md:hidden btn btn-ghost"
        style="width:34px;height:34px;padding:0;justify-content:center;"
        onclick={() => mobileOpen = !mobileOpen}
        aria-label="Abrir menú"
      >
        {#if mobileOpen}<X size={18} />{:else}<Menu size={18} />{/if}
      </button>

      <!-- Title -->
      <h1 style="margin:0;flex:1;min-width:0;font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        {pageTitle}
      </h1>

      <!-- Chat (desktop only — sidebar nav handles mobile) -->
      <span class="max-md:hidden"><ChatFab /></span>

      <!-- Language toggle -->
      <button
        class="btn btn-ghost"
        style="height:34px;padding:0 10px;font-size:12px;font-weight:600;letter-spacing:0.02em;font-variant-numeric:tabular-nums;min-width:44px;justify-content:center;"
        onclick={toggleLocale}
        title="Switch language"
      >
        {$locale === 'es' ? 'EN' : 'ES'}
      </button>

      <!-- Notification bell -->
      <NotificationBell notifications={data.notifications ?? []} />

      <!-- Theme toggle -->
      <button
        class="btn btn-ghost"
        style="width:34px;height:34px;padding:0;justify-content:center;"
        onclick={toggleTheme}
        title="Cambiar tema"
      >
        {#if theme === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
      </button>

      <!-- Upload CTA — mobile only (sidebar handles desktop) -->
      <a href="/" class="md:hidden btn btn-primary" style="height:34px;text-decoration:none;">
        <Upload size={14} />
      </a>
    </header>

    <!-- Page content -->
    <div style="flex:1;overflow:auto;">
      {@render children()}
    </div>

  </div>

</div>
