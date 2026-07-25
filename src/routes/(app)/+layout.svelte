<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import CoachMark from '$lib/components/mep/CoachMark.svelte';
  import { tutorialStep, setTutorialStep, type TutorialStep } from '$lib/stores/tutorial';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import FileText from '@lucide/svelte/icons/file-text';
  import Truck from '@lucide/svelte/icons/truck';
  import Package from '@lucide/svelte/icons/package';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Tag from '@lucide/svelte/icons/tag';
  import Bell from '@lucide/svelte/icons/bell';
  import Settings from '@lucide/svelte/icons/settings';
  import Upload from '@lucide/svelte/icons/upload';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import { locale, t, initLocale } from '$lib/i18n';
  import ChatFab from '$lib/components/mep/ChatFab.svelte';
  import NotificationBell from '$lib/components/mep/NotificationBell.svelte';
  import ErrorBoundary from '$lib/components/mep/ErrorBoundary.svelte';

  const { children, data } = $props();

  const p = $derived($page.url.pathname);
  const is = (path: string) => p === path || p.startsWith(path + '/');

  let theme = $state<'light' | 'dark'>(
    browser ? ((document.documentElement.dataset.theme as 'light' | 'dark') || 'light') : 'light'
  );
  let mobileOpen = $state(false);

  // Seed tutorial store from server data on each navigation
  $effect(() => {
    tutorialStep.set((data.tutorialStep as TutorialStep) ?? null);
  });

  const curPath = $derived($page.url.pathname);
  const isFirstInvoice = $derived($page.url.searchParams.get('first_invoice') === '1');

  // The tour is a single coach mark on the batch review page (issue #230). The
  // upload-zone mark that used to come first explained an empty state whose own
  // headline already said the same thing, on top of four other first-session
  // overlays. '1' is the stored step for "tour not seen yet" — accepted here too
  // so users mid-tour (and anyone who used "repeat the tour") still get it.
  const showReviewCoachMark = $derived(
    ($tutorialStep === '1' || $tutorialStep === '2') && curPath.startsWith('/batch/')
  );
  // Completion card: first invoice landed on dashboard
  const showComplete = $derived(isFirstInvoice && $tutorialStep !== 'dismissed');

  let completeDismissed = $state(false);

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

  // Progressive disclosure (issue #231): before the first saved invoice, every
  // section below Invoices is an empty state — eight of them, plus a quota meter
  // for a quota nobody has touched. They reveal after the first save, which is
  // also when they start having something to show.
  const revealAll = $derived(data.hasCompletedOnboarding);

  interface NavItem {
    href: string;
    icon: typeof LayoutDashboard;
    label: string;
    badge: number;
    sub?: { href: string; label: string }[];
  }

  const navItems = $derived<NavItem[]>([
    { href: '/dashboard',       icon: LayoutDashboard, label: $t('nav.dashboard'),  badge: 0 },
    { href: '/invoices',        icon: FileText,        label: $t('nav.invoices'),   badge: data.invoiceBadge },
    ...(revealAll ? [
    { href: '/suppliers',       icon: Truck,           label: $t('nav.suppliers'),  badge: 0 },
    { href: '/products',        icon: Package,         label: $t('nav.products'),   badge: 0 },
    { href: '/analytics/spend', icon: TrendingUp,      label: $t('nav.analytics'),  badge: 0,
      sub: [
        { href: '/analytics/spend',      label: $t('nav.analytics.spend') },
        { href: '/analytics/prices',     label: $t('nav.analytics.prices') },
        { href: '/analytics/extraction', label: $t('nav.analytics.extraction') },
      ]
    },
    { href: '/budgets',         icon: Tag,             label: $t('nav.budgets'),    badge: 0 },
    { href: '/reminders',       icon: Bell,            label: $t('nav.reminders'),  badge: data.reminderBadge },
    { href: '/digest',          icon: Newspaper,       label: $t('nav.digest'),     badge: 0 },
    { href: '/chat',            icon: MessageCircle,   label: $t('nav.chat'),       badge: 0 },
    ] satisfies NavItem[] : []),
  ]);

  const pageTitle = $derived($page.data.title ? $t($page.data.title) : 'Mise en Place');
  const userName  = $derived(data?.user?.name ?? 'Usuario');
  const userInitials = $derived(
    userName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
  style="width:100%;height:100vh;height:100dvh;display:flex;overflow:hidden;">

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
      fixed left-0 top-0 bottom-0 h-full z-[100]
      transition-transform duration-200
      md:static md:z-auto md:translate-x-0 md:transition-none
      {mobileOpen ? 'translate-x-0' : '-translate-x-full'}
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

    <!-- Quota widget — hidden until the first invoice is saved (issue #231) -->
    {#if revealAll}
    <div style="margin:0 4px 14px;padding:12px;border-radius:8px;background:var(--mep-surface-2);border:1px solid var(--mep-divider);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:500;color:var(--mep-fg-2);">{data.planName}</span>
        <span class="num" style="font-size:11px;color:var(--mep-fg-3);">{data.quotaUsed}/{data.quotaLimit ?? '∞'}</span>
      </div>
      <div style="height:4px;border-radius:2px;background:var(--mep-divider);overflow:hidden;">
        <!-- quotaLimit === null → unlimited plan, nothing to fill up (#295) -->
        <div style="width:{data.quotaLimit ? Math.min(100, Math.round(data.quotaUsed / data.quotaLimit * 100)) : 0}%;height:100%;background:var(--mep-acc);border-radius:2px;"></div>
      </div>
      <div style="font-size:11px;color:var(--mep-fg-3);margin-top:6px;">{$t('shell.quota')}</div>
    </div>
    {/if}

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
    </div>

    <!-- Legal footer -->
    <div style="display:flex;gap:10px;padding:8px 10px 0;flex-wrap:wrap;">
      <a href="/privacy" style="font-size:11px;color:var(--mep-fg-3);text-decoration:none;white-space:nowrap;">{$t('footer.privacy')}</a>
      <a href="/terms"   style="font-size:11px;color:var(--mep-fg-3);text-decoration:none;white-space:nowrap;">{$t('footer.terms')}</a>
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
        aria-label={$t('a11y.openMenu')}
      >
        {#if mobileOpen}<X size={18} />{:else}<Menu size={18} />{/if}
      </button>

      <!-- Title -->
      <h1 style="margin:0;flex:1;min-width:0;font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        {pageTitle}
      </h1>

      <!-- Chat (desktop only — sidebar nav handles mobile) -->
      <span class="hidden md:inline-flex"><ChatFab /></span>

      <!-- Language toggle -->
      <button
        class="btn btn-ghost"
        style="height:34px;padding:0 10px;font-size:12px;font-weight:600;letter-spacing:0.02em;font-variant-numeric:tabular-nums;min-width:44px;justify-content:center;"
        onclick={toggleLocale}
        title={$t('a11y.switchLanguage')}
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
        title={$t('a11y.switchTheme')}
      >
        {#if theme === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
      </button>

      <!-- Upload CTA — mobile only (sidebar handles desktop) -->
      <a href="/" class="md:hidden btn btn-primary" style="height:34px;text-decoration:none;">
        <Upload size={14} />
      </a>
    </header>

    <!-- Page content — boundary contains a post-hydration client render/effect
         error (e.g. the /batch/[id] polling loop, the chat page) to this
         region so the shell survives; +error.svelte still covers load errors. -->
    <div style="flex:1;overflow:auto;">
      <ErrorBoundary {children} />
    </div>

  </div>

</div>

<!-- ── Tutorial coach marks ───────────────────────────────────────────── -->
{#if browser}
  {#if showReviewCoachMark}
    <CoachMark
      selector="invoice-fields"
      title={$t('tour.step2.title')}
      body={$t('tour.step2.body')}
      stepNum={1}
      totalSteps={1}
      nextLabel={$t('tour.step2.next')}
      onNext={() => setTutorialStep('done')}
      onSkip={() => setTutorialStep('dismissed')}
    />
  {/if}

  {#if showComplete && !completeDismissed}
    <!-- Completion overlay -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      style="position:fixed;inset:0;z-index:110;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:24px;"
      role="presentation"
      onclick={() => completeDismissed = true}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        style="
          background:var(--mep-bg);border:1px solid var(--mep-border-strong);
          border-radius:16px;padding:32px 28px;max-width:360px;width:100%;
          box-shadow:0 16px 48px rgba(0,0,0,0.22);text-align:center;
        "
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <div style="font-size:36px;margin-bottom:12px;">🎉</div>
        <div style="font-size:18px;font-weight:700;color:var(--mep-fg);margin-bottom:8px;letter-spacing:-0.3px;">
          {$t('tour.complete.title')}
        </div>
        <p style="font-size:13.5px;color:var(--mep-fg-2);line-height:1.6;margin:0 0 24px;">
          {$t('tour.complete.body')}
        </p>
        <button
          type="button"
          class="btn btn-primary"
          style="width:100%;height:40px;justify-content:center;font-size:14px;"
          onclick={() => completeDismissed = true}
        >
          {$t('tour.complete.btn')}
        </button>
      </div>
    </div>
  {/if}
{/if}
