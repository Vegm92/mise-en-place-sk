<script lang="ts">
  import { page } from '$app/state';
  import { toggleTheme as flipTheme, currentTheme } from '$lib/theme';
  import { onMount, untrack } from 'svelte';
  import { on } from 'svelte/events';
  import { MediaQuery } from 'svelte/reactivity';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import CoachMark from '$lib/components/mep/CoachMark.svelte';
  import Logo from '$lib/components/mep/Logo.svelte';
  import { tutorialStep, setTutorialStep, seedTutorialStep, type TutorialStep } from '$lib/stores/tutorial.svelte';
  import { TOUR_PAGES, tourPageAccessible, nextAccessibleIndex } from '$lib/tour-gating';
  import Lock from '@lucide/svelte/icons/lock';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import FileText from '@lucide/svelte/icons/file-text';
  import Truck from '@lucide/svelte/icons/truck';
  import Package from '@lucide/svelte/icons/package';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import ChefHat from '@lucide/svelte/icons/chef-hat';
  import Tag from '@lucide/svelte/icons/tag';
  import Bell from '@lucide/svelte/icons/bell';
  import Settings from '@lucide/svelte/icons/settings';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import Upload from '@lucide/svelte/icons/upload';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Languages from '@lucide/svelte/icons/languages';
  import LogOut from '@lucide/svelte/icons/log-out';
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { locale, t, initLocale, toggleLocale, ti, tp } from '$lib/i18n';
  import DateRangePicker from '$lib/components/mep/DateRangePicker.svelte';
  import PeriodPicker from '$lib/components/mep/PeriodPicker.svelte';
  import { withPeriodParam } from '$lib/period';
  import { shiftMonth } from '$lib/formatters';
  import ChatFab from '$lib/components/mep/ChatFab.svelte';
  import NotificationBell from '$lib/components/mep/NotificationBell.svelte';
  import ErrorBoundary from '$lib/components/mep/ErrorBoundary.svelte';
  import { clearOfflineQueue, createIndexedDbOfflineQueueStorage } from '$lib/offline-queue';

  const { children, data } = $props();

  const p = $derived(page.url.pathname);
  const is = (path: string) => p === path || p.startsWith(path + '/');

  let theme = $state<'light' | 'dark'>(
    browser ? currentTheme() : 'light'
  );
  let mobileOpen = $state(false);

  function readStoredSidebarCollapsed(): boolean | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('mep-sidebar-collapsed');
    return raw === null ? null : raw === 'true';
  }

  let sidebarCollapsed = $state(readStoredSidebarCollapsed() ?? untrack(() => data.sidebarCollapsed) ?? false);
  let sidebarHasInteracted = $state(false);
  const desktopQuery = new MediaQuery('(min-width: 768px)');
  let isDesktop = $state(false);
  let locationOpen = $state(false);
  let locationRef: HTMLDivElement | undefined = $state();
  let mounted = $state(false);
  let upgradeModalOpen = $state(false);
  let accountOpen = $state(false);
  let accountRef: HTMLDivElement | undefined = $state();
  let headerScrolled = $state(false);
  let mainEl: HTMLElement | undefined = $state();

  $effect(() => {
    if (!browser || !mainEl) return;
    const main = mainEl;
    const onScroll = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLElement) || !main.contains(target)) return;
      if (target.scrollHeight <= target.clientHeight) return;
      if (target.clientHeight < main.clientHeight * 0.6) return;
      const past = target.scrollTop > 12;
      if (past !== headerScrolled) headerScrolled = past;
    };
    return on(document, 'scroll', onScroll, { capture: true });
  });

  $effect(() => {
    void page.url.pathname;
    headerScrolled = false;
    accountOpen = false;
  });

  const upgradeFeatures = [
    { icon: TrendingUp,    key: 'sidebar.upgradeFeatAnalytics' },
    { icon: Newspaper,     key: 'sidebar.upgradeFeatDigest' },
    { icon: MessageCircle, key: 'sidebar.upgradeFeatAssistant' },
  ];

  function handleLogoutSubmit() {
    if (!browser) return;
    void clearOfflineQueue(createIndexedDbOfflineQueueStorage()).catch(() => {});
  }

  function handleNavClick(item: NavItem, e: MouseEvent) {
    if (item.proOnly && item.feature && !data.features[item.feature]) {
      e.preventDefault();
      upgradeModalOpen = true;
    }
  }

  function focusEl(node: HTMLElement) { node.focus(); }

  $effect(() => {
    if (!locationOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (locationRef && !locationRef.contains(e.target as Node)) locationOpen = false;
    };
    return on(document, 'mousedown', onDocClick);
  });

  $effect(() => {
    if (!accountOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (accountRef && !accountRef.contains(e.target as Node)) accountOpen = false;
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') accountOpen = false; };
    const offClick = on(document, 'mousedown', onDocClick);
    const offKey = on(document, 'keydown', onKey);
    return () => {
      offClick();
      offKey();
    };
  });

  const currentLocation = $derived(
    data.locations?.find((loc) => loc.id === data.restaurantId)?.name ?? ''
  );

  $effect(() => {
    isDesktop = desktopQuery.current;
  });

  const collapsed = $derived(isDesktop && sidebarCollapsed);

  function toggleSidebar() {
    sidebarCollapsed = !collapsed;
    sidebarHasInteracted = true;
    localStorage.setItem('mep-sidebar-collapsed', String(sidebarCollapsed));
    fetch('/api/sidebar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collapsed: sidebarCollapsed }),
    }).catch(() => {});
  }

  $effect(() => {
    seedTutorialStep((data.tutorialStep as TutorialStep) ?? null);
  });

  const curPath = $derived(page.url.pathname);
  const isFirstInvoice = $derived(page.url.searchParams.get('first_invoice') === '1');

  const showReviewCoachMark = $derived(
    (tutorialStep.current === '1' || tutorialStep.current === '2') && curPath.startsWith('/batch/')
  );
  const showComplete = $derived(isFirstInvoice && tutorialStep.current !== 'dismissed');

  let completeDismissed = $state(false);

  const showTourNudge = $derived(tutorialStep.current === 'done' && curPath === '/dashboard');

  const visibleTourPages = $derived(TOUR_PAGES.filter(p => p.path !== '/budgets' || data.betaFeatures.budgets));
  const tourPages = $derived(visibleTourPages.filter(p => tourPageAccessible(p.path, data.features)));
  const tourIndex = $derived(tourPages.findIndex(p => p.step === tutorialStep.current));
  const activeTourPage = $derived(tourIndex >= 0 ? tourPages[tourIndex] : null);
  const showTourStep = $derived(activeTourPage !== null && curPath === activeTourPage.path);

  async function goToTourStep(next: { step: string; path: string }) {
    await setTutorialStep(next.step as TutorialStep);
    if (next.path !== curPath) goto(next.path);
  }

  async function advanceTour() {
    const next = tourPages[tourIndex + 1];
    if (!next) {
      await setTutorialStep('dismissed');
      return;
    }
    await goToTourStep(next);
  }

  $effect(() => {
    const stored = visibleTourPages.findIndex(p => p.step === tutorialStep.current);
    if (stored === -1 || tourPageAccessible(visibleTourPages[stored].path, data.features)) return;
    const nextIdx = nextAccessibleIndex(visibleTourPages, stored + 1, data.features);
    if (nextIdx === -1) {
      setTutorialStep('dismissed');
      return;
    }
    void goToTourStep(visibleTourPages[nextIdx]);
  });

  onMount(() => {
    mounted = true;
    const storedTheme = localStorage.getItem('mep-theme') as 'light' | 'dark' | null;
    if (storedTheme && storedTheme !== theme) theme = storedTheme;
    initLocale();
    const close = () => { mobileOpen = false; };
    return on(document, 'sveltekit:navigation-start', close);
  });

  function toggleTheme() {
    theme = flipTheme();
  }


  const revealAll = $derived(data.hasCompletedOnboarding);

  interface NavItem {
    proOnly?: boolean;
    feature?: 'aiAssistant' | 'weeklyDigest' | 'stockTracking';
    href: string;
    icon: typeof LayoutDashboard;
    label: string;
    badge: number;
    sub?: { href: string; label: string }[];
  }

  interface NavSection {
    id: string;
    label: string;
    pro?: boolean;
    items: NavItem[];
  }

  const navSections = $derived<NavSection[]>(
    revealAll
      ? [
          {
            id: 'daily',
            label: t('nav.section.daily'),
            items: [
              { href: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard'), badge: 0 },
              { href: '/invoices',  icon: FileText,        label: t('nav.invoices'),  badge: data.invoiceBadge },
              { href: '/suppliers', icon: Truck,           label: t('nav.suppliers'), badge: 0 },
              { href: '/products',  icon: Package,         label: t('nav.products'),  badge: 0 },
            ],
          },
          {
            id: 'planning',
            label: t('nav.section.planning'),
            items: [
              ...(data.betaFeatures.recipes ? [{ href: '/recipes', icon: ChefHat, label: t('nav.recipes'), badge: 0 }] : []),
              ...(data.betaFeatures.budgets ? [{ href: '/budgets', icon: Tag,     label: t('nav.budgets'), badge: 0 }] : []),
              { href: '/reminders', icon: Bell, label: t('nav.reminders'), badge: data.reminderBadge },
            ],
          },
          {
            id: 'intel',
            label: t('nav.section.intel'),
            pro: true,
            items: [
              { href: '/analytics/spend', icon: TrendingUp, label: t('nav.analytics'), badge: 0, proOnly: true, feature: 'stockTracking',
                sub: [
                  { href: '/analytics/spend',      label: t('nav.analytics.spend') },
                  { href: '/analytics/prices',     label: t('nav.analytics.prices') },
                  { href: '/analytics/extraction', label: t('nav.analytics.extraction') },
                ]
              },
              { href: '/reports', icon: Newspaper,     label: t('nav.digest'), badge: 0, proOnly: true, feature: 'weeklyDigest' },
              { href: '/chat',    icon: MessageCircle, label: t('nav.chat'),   badge: 0, proOnly: true, feature: 'aiAssistant' },
            ],
          },
        ]
      : [
          {
            id: 'daily',
            label: '',
            items: [
              { href: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard'), badge: 0 },
              { href: '/invoices',  icon: FileText,        label: t('nav.invoices'),  badge: data.invoiceBadge },
            ],
          },
        ]
  );

  const itemLocked = (item: NavItem) =>
    !!item.proOnly && !!item.feature && !data.features[item.feature];

  const sectionLocked = (section: NavSection) =>
    !!section.pro && section.items.some(itemLocked);

  const itemActive = (item: NavItem) =>
    is(item.href) || (item.sub?.some((sub) => is(sub.href)) ?? false);

  const sectionActive = (section: NavSection) => section.items.some(itemActive);

  const navItemColor = (parentActive: boolean, locked: boolean) => {
    if (parentActive) return 'var(--mep-acc)';
    if (locked) return 'var(--mep-fg-3)';
    return 'var(--mep-fg-2)';
  };

  const sectionBadge = (section: NavSection) =>
    section.items.reduce((sum, item) => sum + (Number(item.badge) || 0), 0);

  const SECTIONS_KEY = 'mep-nav-sections-collapsed';

  function readCollapsedSections(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  let collapsedSections = $state<string[]>(readCollapsedSections());

  function toggleSection(id: string) {
    collapsedSections = collapsedSections.includes(id)
      ? collapsedSections.filter((s) => s !== id)
      : [...collapsedSections, id];
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(collapsedSections));
    } catch {
    }
  }

  const sectionOpen = (section: NavSection) =>
    collapsed || !section.label || !collapsedSections.includes(section.id);

  let switchingLocation = $state(false);
  let locationError = $state<string | null>(null);

  function locationColor(loc: { id: string; locked: boolean }): string {
    if (loc.locked) return 'var(--mep-fg-4)';
    return loc.id === data.restaurantId ? 'var(--mep-acc)' : 'var(--mep-fg)';
  }
  async function switchLocation(restaurantId: string) {
    if (!restaurantId || restaurantId === data.restaurantId || switchingLocation) return;
    switchingLocation = true;
    locationError = null;
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
      if (res.status === 403) locationError = 'set.locations.err.lockedSwitch';
    } catch {
    }
    switchingLocation = false;
  }

  const periodLink = (href: string) => withPeriodParam(href, {
    activePeriod: data.activePeriod, activeMonth: data.activeMonth, currentMonth: data.currentMonth,
  });
  const monthUrl = (delta: number) => `${page.url.pathname}?month=${shiftMonth(data.activeMonth, delta)}`;
  const monthLabel = $derived(
    new Date(`${data.activeMonth}-02T00:00:00Z`).toLocaleDateString(locale.current, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  );

  const pageTitle = $derived.by(() => {
    if (!page.data.title) return 'Mise en Place';
    if (page.data.titleParams) return ti(page.data.title, page.data.titleParams as Record<string, string | number>);
    return t(page.data.title);
  });
  const userName  = $derived(data?.user?.name ?? 'Usuario');
  const headerPlace = $derived(currentLocation || data.restaurantName || '');
  const canSwitchPlace = $derived((data.locations?.length ?? 0) > 1);
  const userInitials = $derived(
    userName.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={t('app.metaDesc')} />
</svelte:head>

<div class="mep" data-accent="tinta" data-density="default"
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
    <div style="display:flex;align-items:center;gap:6px;padding:0 6px 22px 10px;{collapsed ? 'flex-direction:column;justify-content:center;padding:0 0 22px;' : 'justify-content:space-between;'}">
      {#if collapsed}
        <Logo size={22} />
      {:else}
        <Logo size={20} wordmark />
      {/if}
      <button
        type="button"
        class="btn btn-ghost btn-icon hidden md:flex"
        onclick={toggleSidebar}
        title={collapsed ? t('action.expandSidebar') : t('action.collapseSidebar')}
        aria-label={collapsed ? t('action.expandSidebar') : t('action.collapseSidebar')}
        style="width:28px;height:28px;padding:0;justify-content:center;flex-shrink:0;{collapsed ? 'margin-top:6px;' : ''}"
      >
        {#if collapsed}<PanelLeftOpen size={16} />{:else}<PanelLeftClose size={16} />{/if}
      </button>
    </div>

    {#if !collapsed && data.locations && data.locations.length > 1}
      <div style="display:flex;align-items:center;gap:8px;padding:0 10px 14px;">
        <label for="location-switch" class="shrink-0 text-[11px] text-fg-3">
          {t('nav.location')}
        </label>
        <div style="position:relative;flex:1;min-width:0;" bind:this={locationRef}>
          <button
            type="button"
            id="location-switch"
            class="sidenav-item"
            disabled={switchingLocation}
            onclick={() => (locationOpen = !locationOpen)}
            aria-haspopup="listbox"
            aria-expanded={locationOpen}
            style="
              width:100%;font-size:12.5px;text-align:left;cursor:pointer;
              border-radius:var(--mep-r-input);border:1px solid var(--mep-border-strong);
              background:var(--mep-surface);color:var(--mep-fg);padding:0 10px;
              display:flex;align-items:center;justify-content:space-between;gap:8px;
              {locationOpen ? 'border-color:var(--mep-acc);box-shadow:0 0 0 3px var(--mep-acc-ring);' : ''}
            "
          >
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{currentLocation}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" class="shrink-0 text-fg-3 transition-transform duration-[120ms]" style="{locationOpen ? 'transform:rotate(180deg);' : ''}">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          {#if locationOpen}
            <div
              role="listbox"
              style="
                position:absolute;top:calc(100% + 4px);right:0;min-width:186px;z-index:120;
                background:var(--mep-surface);border:1px solid var(--mep-border-strong);
                border-radius:var(--mep-r-input);box-shadow:0 6px 20px rgba(0,0,0,0.15);
                padding:4px;max-height:220px;overflow-y:auto;
              "
            >
              {#each data.locations as loc}
                <button
                  type="button"
                  role="option"
                  disabled={loc.locked}
                  aria-selected={loc.id === data.restaurantId}
                  aria-disabled={loc.locked}
                  onclick={() => {
                    locationOpen = false;
                    if (loc.id !== data.restaurantId) switchLocation(loc.id);
                  }}
                  style="
                    display:flex;align-items:center;justify-content:space-between;gap:8px;
                    width:100%;text-align:left;cursor:{loc.locked ? 'not-allowed' : 'pointer'};
                    padding:7px 10px;border:none;border-radius:6px;font-size:12.5px;
                    background:{loc.id === data.restaurantId ? 'var(--mep-acc-soft)' : 'transparent'};
                    color:{locationColor(loc)};
                    font-weight:{loc.id === data.restaurantId ? 500 : 400};
                  "
                  onmouseenter={(e) => { if (!loc.locked && loc.id !== data.restaurantId) e.currentTarget.style.background = 'var(--mep-hover)'; }}
                  onmouseleave={(e) => { if (!loc.locked && loc.id !== data.restaurantId) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{loc.name}</span>
                  {#if loc.locked}
                    <Lock size={12} style="flex-shrink:0;" />
                  {/if}
                </button>
              {/each}
              {#if data.locations.some((loc) => loc.locked)}
                <div class="px-2.5 pt-1.5 pb-1 text-[11px] leading-[1.4] text-fg-3 border-t border-divider mt-1">
                  {t('set.locations.lockedHint')}
                </div>
              {/if}
            </div>
          {/if}

          {#if locationError}
            <p class="body text-[11px] leading-[1.4] text-warn mt-1.5 mb-0">{t(locationError)}</p>
          {/if}
        </div>
      </div>
    {/if}

    <a
      href="/"
      onclick={() => mobileOpen = false}
      class="btn btn-primary"
      style="height:38px;justify-content:center;margin-bottom:20px;width:100%;text-decoration:none;{collapsed ? 'padding:0;' : ''}"
      title={collapsed ? t('action.upload') : undefined}
    >
      <Upload size={15} />
      {#if !collapsed}<span>{t('action.upload')}</span>{/if}
    </a>

    <nav style="display:flex;flex-direction:column;">
      {#each navSections as section, sectionIndex}
        {@const locked = sectionLocked(section)}
        {@const open = sectionOpen(section)}
        {@const rolledBadge = open ? 0 : sectionBadge(section)}
        <div style="display:flex;flex-direction:column;gap:1px;{sectionIndex > 0 ? 'margin-top:16px;' : ''}">

          {#if section.label && !collapsed}
            <button
              type="button"
              class="nav-section-toggle"
              aria-expanded={open}
              onclick={() => toggleSection(section.id)}
            >
              <span class="text-[11px] font-semibold tracking-[0.08em] uppercase" class:text-acc={!open && sectionActive(section)} class:text-fg-3={open || !sectionActive(section)}>{section.label}</span>
              {#if locked}
                <span class="inline-flex items-center text-[11px] font-bold tracking-[0.04em] px-[5px] rounded-tag bg-hover text-fg-2 border border-border">{t('nav.badge.pro')}</span>
              {/if}
              <span class="flex-1"></span>
              {#if rolledBadge}
                <span
                  class="num inline-flex items-center justify-center text-[11px] font-semibold min-w-4 h-4 px-[5px] rounded-pill bg-warn-soft text-warn"
                >{rolledBadge}</span>
              {/if}
              <ChevronDown size={12} class="shrink-0 text-fg-3 transition-[transform] duration-[150ms] ease-out" style="transform:rotate({open ? '0deg' : '-90deg'});" />
            </button>
          {:else if section.label && collapsed && sectionIndex > 0}
            <div style="display:flex;align-items:center;justify-content:center;padding:0 0 8px;" aria-hidden="true">
              {#if section.pro}
                <span class="h-px flex-1 bg-border ml-2"></span>
                <Sparkles size={11} class="shrink-0 mx-1.5 text-fg-3" />
                <span class="h-px flex-1 bg-border mr-2"></span>
              {:else}
                <span class="h-px flex-1 bg-divider mx-2"></span>
              {/if}
            </div>
          {/if}

          {#each open ? section.items : [] as item}
            {@const parentActive = itemActive(item)}
            {@const itemIsLocked = itemLocked(item)}
            <a
              href={periodLink(item.href)}
              class="sidenav-item"
              onclick={(e) => { handleNavClick(item, e); if (!e.defaultPrevented) mobileOpen = false; }}
              data-sveltekit-preload-data={item.proOnly ? 'off' : undefined}
              title={collapsed ? item.label : undefined}
              style="
                position:relative;
                display:flex;align-items:center;gap:10px;
                padding:{collapsed ? '7px' : '7px 10px'};
                border-radius:6px;
                cursor:pointer;text-decoration:none;
                justify-content:{collapsed ? 'center' : 'flex-start'};
                background:{parentActive ? 'var(--mep-acc-soft)' : 'transparent'};
                color:{navItemColor(parentActive, itemIsLocked)};
                font-size:13.5px;font-weight:{parentActive ? 500 : 400};
              "
            >
              <item.icon size={16} style={itemIsLocked ? 'opacity:0.5;' : undefined} />
              {#if collapsed && itemIsLocked}
                <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-fg-3" aria-hidden="true"></span>
              {:else if collapsed && item.badge}
                <span
                  class="num"
                  aria-hidden="true"
                  style="
                    position:absolute;top:-2px;right:-2px;font-size:11px;font-weight:600;line-height:1;
                    min-width:16px;height:16px;padding:0 3px;border-radius:var(--mep-r-pill);
                    background:{parentActive ? 'var(--mep-acc)' : 'var(--mep-warn-soft)'};
                    color:{parentActive ? 'var(--mep-acc-fg)' : 'var(--mep-warn)'};
                    display:inline-flex;align-items:center;justify-content:center;
                  "
                >{item.badge > 9 ? '9+' : item.badge}</span>
              {/if}
              {#if !collapsed}
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{item.label}</span>
                {#if itemIsLocked}
                  <Lock size={12} aria-label={t('nav.locked')} class="shrink-0 text-fg-3" />
                {/if}
                {#if item.badge}
                  <span
                    class="num"
                    style="
                      font-size:11px;font-weight:600;min-width:16px;height:16px;
                      padding:0 5px;border-radius:8px;
                      background:{parentActive ? 'var(--mep-acc)' : 'var(--mep-warn-soft)'};
                      color:{parentActive ? 'var(--mep-acc-fg)' : 'var(--mep-warn)'};
                      display:inline-flex;align-items:center;justify-content:center;
                    "
                  >{item.badge}</span>
                {/if}
              {/if}
            </a>

            {#if !collapsed && item.sub && parentActive}
              <div class="ml-8 mt-px mb-1 pl-2.5 border-l border-divider flex flex-col">
                {#each item.sub as sub}
                  <a
                    href={periodLink(sub.href)}
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
        </div>
      {/each}
    </nav>

    <div style="flex:1;"></div>

    {#if !collapsed && revealAll}
    <a href="/billing" onclick={() => mobileOpen = false}
      class="block mx-1 mb-3.5 p-2.5 rounded-lg no-underline border"
      class:bg-neg-soft={data.trialExpired} class:bg-surface-2={!data.trialExpired}
      class:border-neg={data.trialExpired} class:border-divider={!data.trialExpired}>
      {#if data.trialExpired}
        <div class="text-[11px] font-medium text-neg whitespace-nowrap overflow-hidden text-ellipsis">{t('sidebar.trialExpiredChip')}</div>
      {:else}
        <div class="text-[11px] whitespace-nowrap overflow-hidden text-ellipsis" style="{data.quotaLimit ? 'margin-bottom:7px;' : ''}"><span class="font-medium text-fg-2">{t(data.planNameKey)}</span><span class="text-fg-3">&nbsp;·&nbsp;</span><span class="num text-fg-3">{data.quotaUsed}{#if data.quotaLimit}/{data.quotaLimit}{/if}</span><span class="text-fg-3">&nbsp;{#if data.subscriptionStatus === 'canceled'}· {t('billing.canceled')}{:else}{t('shell.quota')}{/if}</span></div>
        {#if data.quotaLimit}
          <div class="h-1 rounded-sm bg-divider overflow-hidden">
            <div class="h-full bg-acc rounded-sm" style="width:{Math.min(100, Math.round(data.quotaUsed / data.quotaLimit * 100))}%;{data.quotaUsed > 0 ? 'min-width:3px;' : ''}"></div>
          </div>
        {/if}
      {/if}
    </a>
    {/if}

{#if !collapsed}
      <div style="display:flex;flex-direction:column;gap:1px;">
        <a
          href="/settings"
          onclick={() => mobileOpen = false}
          class="flex items-center gap-2.5 px-2.5 py-1.5 h-[30px] rounded-md text-fg-3 text-[13px] no-underline"
        >
          <Settings size={15} />
          <span>{t('nav.settings')}</span>
        </a>

        <a
          href="/help"
          onclick={() => mobileOpen = false}
          class="flex items-center gap-2.5 px-2.5 py-1.5 h-[30px] rounded-md text-fg-3 text-[13px] no-underline"
        >
          <CircleHelp size={15} />
          <span>{t('nav.help')}</span>
        </a>

        <button
          type="button"
          class="md:hidden flex items-center gap-2.5 px-2.5 py-1.5 h-[30px] rounded-md text-fg-3 text-[13px] bg-transparent border-0 cursor-pointer text-left w-full"
          onclick={toggleLocale}
        >
          <Languages size={15} />
          <span>{t('a11y.switchLanguage')}</span>
        </button>

        <button
          type="button"
          class="md:hidden flex items-center gap-2.5 px-2.5 py-1.5 h-[30px] rounded-md text-fg-3 text-[13px] bg-transparent border-0 cursor-pointer text-left w-full"
          onclick={toggleTheme}
        >
          {#if theme === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
          <span>{t('a11y.switchTheme')}</span>
        </button>
      </div>

      <div style="display:flex;gap:10px;padding:8px 10px 0;flex-wrap:wrap;">
        <a href="/privacy" class="text-[11px] text-fg-3 no-underline whitespace-nowrap">{t('footer.privacy')}</a>
        <a href="/terms"   class="text-[11px] text-fg-3 no-underline whitespace-nowrap">{t('footer.terms')}</a>
      </div>

      <div style="margin-top:10px;padding:8px;display:flex;align-items:center;gap:10px;border-radius:8px;">
        <div class="w-7 h-7 rounded-[14px] shrink-0 bg-acc text-acc-fg text-[11px] font-semibold flex items-center justify-center">
          {userInitials}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[12.5px] font-medium text-fg leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap">
            {userName}
          </div>
          <div class="text-[11px] text-fg-3">{data.restaurantName}</div>
        </div>
        <form method="POST" action="/logout" style="flex-shrink:0;" onsubmit={handleLogoutSubmit}>
          <button
            type="submit"
            title={t('action.switchAccount')}
            aria-label={t('action.switchAccount')}
            class="w-10 h-10 bg-transparent border-0 cursor-pointer text-fg-3 flex items-center justify-center rounded-md"
          >
            <ArrowLeftRight size={13} />
          </button>
        </form>
        <form method="POST" action="/logout" class="shrink-0" onsubmit={handleLogoutSubmit}>
          <button
            type="submit"
            title={t('action.logout')}
            aria-label={t('action.logout')}
            class="w-10 h-10 bg-transparent border-0 cursor-pointer text-fg-3 flex items-center justify-center rounded-md"
          >
            <LogOut size={13} />
          </button>
        </form>
      </div>
    {:else}
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
        <a
          href="/settings"
          onclick={() => mobileOpen = false}
          class="btn btn-ghost btn-icon"
          title={t('nav.settings')}
          aria-label={t('nav.settings')}
          style="width:34px;height:34px;padding:0;justify-content:center;"
        >
          <Settings size={15} />
        </a>
        <a
          href="/help"
          onclick={() => mobileOpen = false}
          class="btn btn-ghost btn-icon"
          title={t('nav.help')}
          aria-label={t('nav.help')}
          style="width:34px;height:34px;padding:0;justify-content:center;"
        >
          <CircleHelp size={15} />
        </a>
        <form method="POST" action="/logout" onsubmit={handleLogoutSubmit}>
          <button
            type="submit"
            class="btn btn-ghost btn-icon"
            title={t('action.logout')}
            aria-label={t('action.logout')}
            style="width:34px;height:34px;padding:0;justify-content:center;"
          >
            <LogOut size={15} />
          </button>
        </form>
      </div>
    {/if}
  </aside>
  </div>
  {:else}
    <div style="width:232px;flex-shrink:0;display:flex;flex-direction:column;"></div>
  {/if}

  <div class="flex-1 min-w-0 flex flex-col bg-bg">

    <header class="app-header shell-header {headerScrolled ? 'is-condensed' : ''}">

      <button
        class="md:hidden btn btn-ghost btn-icon"
        style="width:34px;height:34px;padding:0;justify-content:center;"
        onclick={() => mobileOpen = !mobileOpen}
        aria-label={t('a11y.openMenu')}
      >
        {#if mobileOpen}<X size={18} />{:else}<Menu size={18} />{/if}
      </button>

      <div class="shell-heading">
        {#if headerPlace}
          {#if canSwitchPlace}
            <button
              type="button"
              class="shell-eyebrow"
              onclick={() => mobileOpen = true}
              title={t('nav.location')}
            >
              <span>{headerPlace}</span>
              <ChevronDown size={11} />
            </button>
          {:else}
            <span class="shell-eyebrow"><span>{headerPlace}</span></span>
          {/if}
        {/if}
        <h1 class="shell-title">
          {pageTitle}
        </h1>
      </div>

      {#if data.periodMode === 'range'}
        <DateRangePicker active={data.activePeriod} />
      {:else if data.periodMode === 'month'}
        <PeriodPicker prevUrl={monthUrl(-1)} nextUrl={monthUrl(1)} canGoForward={data.activeMonth < data.currentMonth} label={monthLabel} />
      {/if}

      <span class="hidden md:inline-flex"><ChatFab locked={!data.features.aiAssistant} /></span>

      <a href="/" class="btn btn-primary shell-primary" style="height:34px;text-decoration:none;">
        <Upload size={14} />
        <span class="shell-primary-label">{t('upload.btn')}</span>
      </a>

      <span class="shell-divider hidden md:block"></span>

      <span class="shell-bell"><NotificationBell notifications={data.notifications ?? []} /></span>

      <div class="hidden md:block" style="position:relative;" bind:this={accountRef}>
        <button
          type="button"
          class="acct-trigger"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onclick={() => (accountOpen = !accountOpen)}
          title={t('a11y.account')}
        >
          <span class="acct-avatar">{userInitials}</span>
          <ChevronDown size={13} />
        </button>

        {#if accountOpen}
          <div class="acct-menu" role="menu">
            <div class="acct-identity">
              <span class="acct-avatar acct-avatar-lg">{userInitials}</span>
              <div style="min-width:0;flex:1;">
                <div class="acct-name">{userName}</div>
                <div class="acct-sub">{data.restaurantName}</div>
              </div>
            </div>

            <div class="acct-sep"></div>

            <a href="/settings" class="acct-item" role="menuitem" onclick={() => (accountOpen = false)}>
              <Settings size={15} />
              <span>{t('nav.settings')}</span>
            </a>
            <a href="/help" class="acct-item" role="menuitem" onclick={() => (accountOpen = false)}>
              <CircleHelp size={15} />
              <span>{t('nav.help')}</span>
            </a>

            <div class="acct-sep"></div>

            <button type="button" class="acct-item" role="menuitem" onclick={toggleTheme}>
              {#if theme === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
              <span class="flex-1">{t('a11y.switchTheme')}</span>
            </button>
            <button type="button" class="acct-item" role="menuitem" onclick={toggleLocale}>
              <Languages size={15} />
              <span class="flex-1">{t('a11y.switchLanguage')}</span>
              <span class="text-[11px] font-semibold tracking-[0.02em] text-fg-3">
                {locale.current === 'es' ? 'EN' : 'ES'}
              </span>
            </button>

            <div class="acct-sep"></div>

            <form method="POST" action="/logout" onsubmit={handleLogoutSubmit}>
              <button type="submit" class="acct-item" role="menuitem">
                <ArrowLeftRight size={15} />
                <span>{t('action.switchAccount')}</span>
              </button>
            </form>
            <form method="POST" action="/logout" onsubmit={handleLogoutSubmit}>
              <button type="submit" class="acct-item" role="menuitem">
                <LogOut size={15} />
                <span>{t('action.logout')}</span>
              </button>
            </form>
          </div>
        {/if}
      </div>
    </header>

    {#if data.trialExpired && !is('/billing')}
      <div class="shrink-0 px-5 py-2.5 bg-neg-soft border-b border-neg flex items-center gap-3 flex-wrap">
        <span class="flex-1 min-w-[200px] text-[13px] text-neg">{t('billing.trialExpiredMsg')}</span>
        <a href="/billing?upgrade=trial" class="btn btn-primary" style="height:34px;padding:0 14px;text-decoration:none;flex-shrink:0;">
          {t('billing.subscribeNow')}
        </a>
      </div>
    {/if}

    {#if data.openBatches?.length > 0 && !is('/batch')}
      <div class="shrink-0 px-5 py-2.5 bg-warn-soft border-b border-warn flex items-center gap-3 flex-wrap">
        <span class="flex-1 min-w-[200px] text-[13px] text-warn">{tp('upload.openBatches.warning', data.openBatches.length)}</span>
        <a href="/batch/{data.openBatches[0].batchId}" class="btn btn-primary" style="height:34px;padding:0 14px;text-decoration:none;flex-shrink:0;">
          {t('upload.openBatches.resume')}
        </a>
      </div>
    {/if}

    <main style="flex:1;overflow:auto;" bind:this={mainEl}>
      <ErrorBoundary {children} />
    </main>

  </div>

  {#if browser}
    {#if showReviewCoachMark}
      <CoachMark
        selector="invoice-fields"
        title={t('help.start.review.title')}
        body={t('help.start.review.body')}
        stepNum={1}
        totalSteps={1}
        nextLabel={t('tour.next.review')}
        onNext={() => setTutorialStep('done')}
        onSkip={() => setTutorialStep('dismissed')}
      />
    {/if}

    {#if showComplete && !completeDismissed}
      <div
        class="fixed inset-0 z-[110] flex items-center justify-center p-6"
        style="background:var(--mep-scrim);"
        role="presentation"
        onclick={() => completeDismissed = true}
      >
        <div
          style="
            background:var(--mep-overlay);border:1px solid var(--mep-border-strong);
            border-radius:var(--mep-r-card);padding:32px 28px;max-width:360px;width:100%;
            box-shadow:var(--mep-shadow-pop);text-align:center;
          "
          role="dialog"
          tabindex="-1"
          aria-modal="true"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.stopPropagation()}
        >
          <div class="hero" style="margin-bottom:12px;">🎉</div>
          <div class="title" style="margin-bottom:8px;">
            {t('tour.complete.title')}
          </div>
          <p class="body" style="line-height:1.6;margin:0 0 24px;">
            {t('tour.complete.body')}
          </p>
          <button
            type="button"
            class="btn btn-primary"
            style="width:100%;height:40px;justify-content:center;font-size:13px;"
            onclick={() => completeDismissed = true}
          >
            {t('tour.complete.btn')}
          </button>
        </div>
      </div>
    {/if}

    {#if showTourStep && activeTourPage}
      <CoachMark
        selector={activeTourPage.anchor}
        title={t(`help.tip.${activeTourPage.tip}.title`)}
        body={t(`help.tip.${activeTourPage.tip}.body`)}
        stepNum={tourIndex + 1}
        totalSteps={tourPages.length}
        nextLabel={tourIndex === tourPages.length - 1 ? t('tour.next.finish') : undefined}
        onNext={advanceTour}
        onSkip={() => setTutorialStep('dismissed')}
      />
    {/if}

    {#if showTourNudge}
      <div
        style="
          position:fixed;right:20px;bottom:20px;z-index:105;
          width:300px;background:var(--mep-overlay);border:1px solid var(--mep-border-strong);
          border-radius:var(--mep-r-card);padding:16px 16px 14px;box-shadow:var(--mep-shadow-pop);
        "
        role="complementary"
        aria-label={t('tour.nudge.title')}
      >
        <div class="subtitle" style="margin-bottom:6px;">
          {t('tour.nudge.title')}
        </div>
        <p class="body" style="line-height:1.5;margin:0 0 14px;">
          {ti('tour.nudge.body', { n: tourPages.length })}
        </p>
        <div style="display:flex;gap:8px;">
          <button
            type="button"
            class="btn btn-ghost"
            style="flex:1;height:34px;font-size:13px;justify-content:center;"
            onclick={() => setTutorialStep('dismissed')}
          >
            {t('tour.nudge.dismiss')}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            style="flex:1;height:34px;font-size:13px;justify-content:center;"
            onclick={() => setTutorialStep(tourPages[0].step)}
          >
            {t('tour.nudge.accept')}
          </button>
        </div>
      </div>
    {/if}

    {#if upgradeModalOpen}
      <div
        class="fixed inset-0 z-[110] flex items-center justify-center p-6"
        style="background:var(--mep-scrim);"
        role="presentation"
        onclick={() => upgradeModalOpen = false}
      >
        <div
          style="
            background:var(--mep-overlay);border:1px solid var(--mep-border-strong);
            border-radius:var(--mep-r-card);padding:24px;max-width:380px;width:100%;
            box-shadow:var(--mep-shadow-pop);
          "
          role="dialog"
          tabindex="-1"
          aria-modal="true"
          aria-labelledby="upgrade-modal-title"
          use:focusEl
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => { if (e.key === 'Escape') upgradeModalOpen = false; else e.stopPropagation(); }}
        >
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <Sparkles size={18} class="text-acc shrink-0" />
            <strong id="upgrade-modal-title" class="flex-1 text-base font-semibold text-fg tracking-[-0.01em]">
              {t('sidebar.upgradeToProTitle')}
            </strong>
            <span class="inline-flex items-center text-[11px] font-bold tracking-[0.04em] px-[5px] rounded-tag bg-hover text-fg-2 border border-border">{t('nav.badge.pro')}</span>
          </div>
          <p class="body" style="line-height:1.6;margin:0 0 16px;">
            {t('sidebar.upgradeToProDesc')}
          </p>
          <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:20px;">
            {#each upgradeFeatures as feature}
              {@const Icon = feature.icon}
              <div class="flex items-center gap-2.5 px-2.5 rounded-input bg-hover" style="height:var(--mep-row-h);">
                <span class="w-7 h-7 shrink-0 rounded-input bg-acc-soft text-acc inline-flex items-center justify-center">
                  <Icon size={16} />
                </span>
                <span class="body-strong">{t(feature.key)}</span>
              </div>
            {/each}
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button
              type="button"
              class="btn btn-secondary"
              style="height:36px;"
              onclick={() => upgradeModalOpen = false}
            >
              {t('action.cancel')}
            </button>
            <a href="/billing" class="btn btn-primary" style="height:36px;text-decoration:none;" onclick={() => upgradeModalOpen = false}>
              {t('sidebar.upgradeCta')}
            </a>
          </div>
        </div>
      </div>
    {/if}
  {/if}

</div>
