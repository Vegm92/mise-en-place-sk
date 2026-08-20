<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import CoachMark from '$lib/components/mep/CoachMark.svelte';
  import { tutorialStep, setTutorialStep, type TutorialStep } from '$lib/stores/tutorial';
  import { TOUR_PAGES, tourPageAccessible, nextAccessibleIndex } from '$lib/tour-gating';
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
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import { locale, t, initLocale, ti } from '$lib/i18n';
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
  let sidebarCollapsed = $state(
    typeof localStorage !== 'undefined' && localStorage.getItem('mep-sidebar-collapsed') === 'true'
  );
  let sidebarHasInteracted = $state(false);
  let isDesktop = $state(false);
  let mounted = $state(false);

  $effect(() => {
    if (!browser) return;
    const mq = window.matchMedia('(min-width: 768px)');
    isDesktop = mq.matches;
    const onChange = () => (isDesktop = mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  const collapsed = $derived(isDesktop && sidebarCollapsed);

  function toggleSidebar() {
    sidebarCollapsed = !collapsed;
    sidebarHasInteracted = true;
    localStorage.setItem('mep-sidebar-collapsed', String(sidebarCollapsed));
  }

  $effect(() => {
    tutorialStep.set((data.tutorialStep as TutorialStep) ?? null);
  });

  const curPath = $derived($page.url.pathname);
  const isFirstInvoice = $derived($page.url.searchParams.get('first_invoice') === '1');

  const showReviewCoachMark = $derived(
    ($tutorialStep === '1' || $tutorialStep === '2') && curPath.startsWith('/batch/')
  );
  const showComplete = $derived(isFirstInvoice && $tutorialStep !== 'dismissed');

  let completeDismissed = $state(false);

  const showTourNudge = $derived($tutorialStep === 'done' && curPath === '/dashboard');

  const tourIndex = $derived(TOUR_PAGES.findIndex(p => p.step === $tutorialStep));
  const activeTourPage = $derived(tourIndex >= 0 ? TOUR_PAGES[tourIndex] : null);
  const showTourStep = $derived(
    activeTourPage !== null && curPath === activeTourPage.path && tourPageAccessible(activeTourPage.path, data.features)
  );

  function advanceTour() {
    const nextIdx = nextAccessibleIndex(TOUR_PAGES, tourIndex + 1, data.features);
    if (nextIdx === -1) {
      setTutorialStep('dismissed');
      return;
    }
    const next = TOUR_PAGES[nextIdx];
    setTutorialStep(next.step);
    if (next.path !== curPath) goto(next.path);
  }

  $effect(() => {
    if (activeTourPage && !tourPageAccessible(activeTourPage.path, data.features)) advanceTour();
  });

  onMount(() => {
    mounted = true;
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

  let switchingLocation = $state(false);
  async function switchLocation(restaurantId: string) {
    if (!restaurantId || restaurantId === data.restaurantId || switchingLocation) return;
    switchingLocation = true;
    try {
      const res = await fetch('/api/active-restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId }),
      });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
    } catch {
    }
    switchingLocation = false;
  }

  const pageTitle = $derived($page.data.title ? $t($page.data.title) : 'Mise en Place');
  const userName  = $derived(data?.user?.name ?? 'Usuario');
  const userInitials = $derived(
    userName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={$t('app.metaDesc')} />
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
  style="width:100%;height:100vh;height:100dvh;display:flex;overflow:hidden;">

  {#if mobileOpen}
    <div
      class="fixed inset-0 z-99 bg-black/60 md:hidden"
      onclick={() => mobileOpen = false}
      role="presentation"
    ></div>
  {/if}

  {#if mounted}
  <div style="position:relative;height:100%;flex-shrink:0;z-index:101;">
  <aside
    style="
      width:{collapsed ? '64px' : '232px'};
      {sidebarHasInteracted ? 'transition:width 200ms ease;' : ''}
      height:100%;
      background:var(--mep-surface);
      border-right:1px solid var(--mep-divider);
      display:flex;flex-direction:column;
      padding:{collapsed ? '20px 6px 16px' : '20px 12px 16px'};
      overflow-y:auto;overflow-x:hidden;
    "
    class="
      fixed left-0 top-0 bottom-0 h-full z-100
      transition-transform duration-200
      md:static md:z-auto md:translate-x-0 md:transition-none
      {mobileOpen ? 'translate-x-0' : '-translate-x-full'}
    "
  >
    <div style="display:flex;align-items:center;gap:10px;padding:0 10px 22px;{collapsed ? 'justify-content:center;' : ''}">
      <svg width="22" height="22" viewBox="0 0 24 24" style="color:var(--mep-acc);flex-shrink:0;">
        <rect x="2.5"  y="3.5" width="3" height="17" rx="1.5" fill="currentColor"/>
        <rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor"/>
        <rect x="18.5" y="3.5" width="3" height="9"  rx="1.5" fill="currentColor"/>
      </svg>
      {#if !collapsed}
        <span style="font-size:15px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">
          Mise en Place
        </span>
      {/if}
    </div>

    {#if !collapsed && data.locations && data.locations.length > 1}
      <div style="padding:0 10px 14px;">
        <label for="location-switch" style="display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:var(--mep-fg-4);margin-bottom:5px;">
          {$t('nav.location')}
        </label>
        <select
          id="location-switch"
          class="input"
          style="height:32px;font-size:12.5px;width:100%;"
          disabled={switchingLocation}
          value={data.restaurantId}
          onchange={(e) => switchLocation((e.currentTarget as HTMLSelectElement).value)}
        >
          {#each data.locations as loc}
            <option value={loc.id}>{loc.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <a
      href="/"
      onclick={() => mobileOpen = false}
      class="btn btn-primary"
      style="height:38px;justify-content:center;margin-bottom:20px;width:100%;text-decoration:none;{collapsed ? 'padding:0;' : ''}"
      title={collapsed ? $t('action.upload') : undefined}
    >
      <Upload size={15} />
      {#if !collapsed}<span>{$t('action.upload')}</span>{/if}
    </a>

    <nav style="display:flex;flex-direction:column;gap:1px;">
      {#each navItems as item}
        {@const parentActive = is(item.href) || (item.sub?.some(s => is(s.href)) ?? false)}
        <a
          href={item.href}
          onclick={() => mobileOpen = false}
          title={collapsed ? item.label : undefined}
          style="
            display:flex;align-items:center;gap:10px;
            padding:{collapsed ? '7px' : '7px 10px'};
            height:32px;border-radius:6px;
            cursor:pointer;text-decoration:none;
            justify-content:{collapsed ? 'center' : 'flex-start'};
            background:{parentActive ? 'var(--mep-acc-soft)' : 'transparent'};
            color:{parentActive ? 'var(--mep-acc)' : 'var(--mep-fg-2)'};
            font-size:13.5px;font-weight:{parentActive ? 500 : 400};
          "
        >
          <item.icon size={16} />
          {#if !collapsed}
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
          {/if}
        </a>

        {#if !collapsed && item.sub && (is(item.href) || (item.sub?.some(s => is(s.href)) ?? false))}
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

    {#if !collapsed && revealAll}
    <a href="/billing" onclick={() => mobileOpen = false}
      style="display:block;margin:0 4px 14px;padding:12px;border-radius:8px;background:var(--mep-surface-2);border:1px solid var(--mep-divider);text-decoration:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:500;color:var(--mep-fg-2);">{data.planName}{#if data.cancelAtPeriodEnd && data.currentPeriodEnd}<span style="color:var(--mep-warn);"> · {$ti('billing.cancelsOn', { date: new Date(data.currentPeriodEnd).toLocaleDateString($locale, { year: 'numeric', month: 'long', day: 'numeric' }) })}</span>{:else if data.subscriptionStatus === 'canceled'}<span style="color:var(--mep-fg-3);"> · {$t('billing.canceled')}</span>{/if}</span>
        <span class="num" style="font-size:11px;color:var(--mep-fg-3);">{data.quotaUsed}/{data.quotaLimit ?? '∞'}</span>
      </div>
      <div style="height:4px;border-radius:2px;background:var(--mep-divider);overflow:hidden;">
        <div style="width:{data.quotaLimit ? Math.min(100, Math.round(data.quotaUsed / data.quotaLimit * 100)) : 0}%;height:100%;background:var(--mep-acc);border-radius:2px;"></div>
      </div>
      <div style="font-size:11px;color:var(--mep-fg-3);margin-top:6px;">{$t('shell.quota')}</div>
    </a>
    {/if}

{#if !collapsed}
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

      <div style="display:flex;gap:10px;padding:8px 10px 0;flex-wrap:wrap;">
        <a href="/privacy" style="font-size:11px;color:var(--mep-fg-3);text-decoration:none;white-space:nowrap;">{$t('footer.privacy')}</a>
        <a href="/terms"   style="font-size:11px;color:var(--mep-fg-3);text-decoration:none;white-space:nowrap;">{$t('footer.terms')}</a>
      </div>

      <div style="margin-top:10px;padding:8px;display:flex;align-items:center;gap:10px;border-radius:8px;">
        <div style="width:28px;height:28px;border-radius:14px;flex-shrink:0;background:var(--mep-acc);color:var(--mep-acc-fg);font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;">
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
            title={$t('action.switchAccount')}
            style="background:transparent;border:none;cursor:pointer;color:var(--mep-fg-3);display:flex;align-items:center;padding:2px;border-radius:4px;"
          >
            <ArrowLeftRight size={13} />
          </button>
        </form>
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
    {/if}
  </aside>

  <button
    class="btn btn-ghost hidden md:flex"
    style="position:absolute;top:50%;right:-17px;transform:translateY(-50%);width:34px;height:34px;padding:0;justify-content:center;border-radius:9999px;box-shadow:0 1px 3px rgba(0,0,0,0.15);"
    onclick={toggleSidebar}
    title={collapsed ? $t('action.expandSidebar') : $t('action.collapseSidebar')}
  >
    {#if collapsed}<ChevronRight size={16} />{:else}<ChevronLeft size={16} />{/if}
  </button>
  </div>
  {:else}
    <div style="width:232px;flex-shrink:0;display:flex;flex-direction:column;"></div>
  {/if}

  <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--mep-bg);">

    <header style="height:56px;flex-shrink:0;display:flex;align-items:center;padding:0 16px;gap:10px;border-bottom:1px solid var(--mep-divider);background:var(--mep-bg);">

      <button
        class="md:hidden btn btn-ghost"
        style="width:34px;height:34px;padding:0;justify-content:center;"
        onclick={() => mobileOpen = !mobileOpen}
        aria-label={$t('a11y.openMenu')}
      >
        {#if mobileOpen}<X size={18} />{:else}<Menu size={18} />{/if}
      </button>

      <h1 style="margin:0;flex:1;min-width:0;font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        {pageTitle}
      </h1>

      <span class="hidden md:inline-flex"><ChatFab /></span>

      <button
        class="btn btn-ghost"
        style="height:34px;padding:0 10px;font-size:12px;font-weight:600;letter-spacing:0.02em;font-variant-numeric:tabular-nums;min-width:44px;justify-content:center;"
        onclick={toggleLocale}
        title={$t('a11y.switchLanguage')}
      >
        {$locale === 'es' ? 'EN' : 'ES'}
      </button>

      <NotificationBell notifications={data.notifications ?? []} />

      <button
        class="btn btn-ghost"
        style="width:34px;height:34px;padding:0;justify-content:center;"
        onclick={toggleTheme}
        title={$t('a11y.switchTheme')}
      >
        {#if theme === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
      </button>

      <a href="/" class="md:hidden btn btn-primary" style="height:34px;text-decoration:none;">
        <Upload size={14} />
      </a>
    </header>

    <main style="flex:1;overflow:auto;">
      <ErrorBoundary {children} />
    </main>

  </div>

</div>

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
    <div
      style="position:fixed;inset:0;z-index:110;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:24px;"
      role="presentation"
      onclick={() => completeDismissed = true}
    >
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

  {#if showTourStep && activeTourPage}
    <CoachMark
      selector={activeTourPage.anchor}
      title={$t(`tour.step${activeTourPage.step}.title`)}
      body={$t(`tour.step${activeTourPage.step}.body`)}
      stepNum={tourIndex + 1}
      totalSteps={TOUR_PAGES.length}
      nextLabel={activeTourPage.step === '11' ? $t('tour.step11.next') : undefined}
      onNext={advanceTour}
      onSkip={() => setTutorialStep('dismissed')}
    />
  {/if}

  {#if showTourNudge}
    <div
      style="
        position:fixed;right:20px;bottom:20px;z-index:105;
        width:300px;background:var(--mep-bg);border:1px solid var(--mep-border-strong);
        border-radius:14px;padding:16px 16px 14px;box-shadow:0 8px 32px rgba(0,0,0,0.18);
      "
      role="complementary"
      aria-label={$t('tour.nudge.title')}
    >
      <div style="font-size:14px;font-weight:600;color:var(--mep-fg);margin-bottom:6px;">
        {$t('tour.nudge.title')}
      </div>
      <p style="font-size:12.5px;color:var(--mep-fg-2);line-height:1.5;margin:0 0 14px;">
        {$t('tour.nudge.body')}
      </p>
      <div style="display:flex;gap:8px;">
        <button
          type="button"
          class="btn btn-ghost"
          style="flex:1;height:34px;font-size:12.5px;justify-content:center;"
          onclick={() => setTutorialStep('dismissed')}
        >
          {$t('tour.nudge.dismiss')}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          style="flex:1;height:34px;font-size:12.5px;justify-content:center;"
          onclick={() => setTutorialStep('3')}
        >
          {$t('tour.nudge.accept')}
        </button>
      </div>
    </div>
  {/if}
{/if}
