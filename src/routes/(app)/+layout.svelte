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
  const activeTourPage = $derived(tourIndex >= 0 ? (tourPages[tourIndex] ?? null) : null);
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
    if (stored === -1 || tourPageAccessible(visibleTourPages[stored]!.path, data.features)) return;
    const nextIdx = nextAccessibleIndex(visibleTourPages, stored + 1, data.features);
    if (nextIdx === -1) {
      setTutorialStep('dismissed');
      return;
    }
    void goToTourStep(visibleTourPages[nextIdx]!);
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
    if (parentActive) return 'text-acc';
    if (locked) return 'text-fg-3';
    return 'text-fg-2';
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
    if (loc.locked) return 'text-fg-4';
    return loc.id === data.restaurantId ? 'text-acc' : 'text-fg';
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
    style="width:{collapsed ? '64px' : '232px'};{sidebarHasInteracted ? 'transition:width 200ms ease;' : ''}padding:{collapsed ? '20px 6px 16px' : '20px 12px 16px'};"
    class="
      fixed left-0 top-0 bottom-0 h-full z-100 bg-surface border-r border-divider flex flex-col overflow-y-auto overflow-x-hidden
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
            class="sidenav-item w-full text-[12.5px] text-left cursor-pointer rounded-input border border-border-strong bg-surface text-fg px-[10px] flex items-center justify-between gap-2 {locationOpen ? 'border-acc shadow-[0_0_0_3px_var(--mep-acc-ring)]' : ''}"
            disabled={switchingLocation}
            onclick={() => (locationOpen = !locationOpen)}
            aria-haspopup="listbox"
            aria-expanded={locationOpen}
          >
            <span class="overflow-hidden text-ellipsis whitespace-nowrap">{currentLocation}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" class="shrink-0 text-fg-3" style="{locationOpen ? 'transform:rotate(180deg);' : ''}transition:transform 120ms;">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          {#if locationOpen}
            <div
              role="listbox"
              class="absolute top-[calc(100%_+_4px)] right-0 min-w-[186px] z-[120] bg-surface border border-border-strong rounded-input shadow-[0_6px_20px_rgba(0,0,0,0.15)] p-1 max-h-[220px] overflow-y-auto"
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
                  class="flex items-center justify-between gap-2 w-full text-left py-[7px] px-[10px] border-none rounded-md text-[12.5px] {loc.id === data.restaurantId ? 'bg-acc-soft font-medium' : 'font-normal'} {locationColor(loc)} {loc.locked ? 'cursor-not-allowed' : 'cursor-pointer'}"
                  onmouseenter={(e) => { if (!loc.locked && loc.id !== data.restaurantId) (e.currentTarget as HTMLElement).style.background = 'var(--mep-hover)'; }}
                  onmouseleave={(e) => { if (!loc.locked && loc.id !== data.restaurantId) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span class="overflow-hidden text-ellipsis whitespace-nowrap">{loc.name}</span>
                  {#if loc.locked}
                    <Lock size={12} style="flex-shrink:0;" />
                  {/if}
                </button>
              {/each}
              {#if data.locations.some((loc) => loc.locked)}
                <div class="px-[10px] pt-[6px] pb-1 text-[11px] leading-[1.4] text-fg-3 border-t border-divider mt-1">
                  {t('set.locations.lockedHint')}
                </div>
              {/if}
            </div>
          {/if}

          {#if locationError}
            <p class="body text-[11px] leading-[1.4] text-warn mt-[6px] mb-0">{t(locationError)}</p>
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
              <span class="text-[11px] font-semibold tracking-[0.08em] uppercase {!open && sectionActive(section) ? 'text-acc' : 'text-fg-3'}">{section.label}</span>
              {#if locked}
                <span class="inline-flex items-center text-[11px] font-bold tracking-[0.04em] px-[5px] rounded-tag bg-hover text-fg-2 border border-border">{t('nav.badge.pro')}</span>
              {/if}
              <span class="flex-1"></span>
              {#if rolledBadge}
                <span
                  class="num text-[11px] font-semibold min-w-4 h-4 px-[5px] rounded-pill bg-warn-soft text-warn inline-flex items-center justify-center"
                >{rolledBadge}</span>
              {/if}
              <ChevronDown size={12} class="shrink-0 text-fg-3" style="transition:transform 150ms ease-out;transform:rotate({open ? '0deg' : '-90deg'});" />
            </button>
          {:else if section.label && collapsed && sectionIndex > 0}
            <div style="display:flex;align-items:center;justify-content:center;padding:0 0 8px;" aria-hidden="true">
              {#if section.pro}
                <span class="h-px flex-1 bg-border ml-2"></span>
                <Sparkles size={11} class="shrink-0 mx-[6px] text-fg-3" />
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
              class="sidenav-item relative flex items-center gap-2.5 py-[7px] rounded-md cursor-pointer no-underline text-[13.5px] {collapsed ? 'justify-center px-[7px]' : 'justify-start px-[10px]'} {parentActive ? 'bg-acc-soft font-medium' : 'font-normal'} {navItemColor(parentActive, itemIsLocked)}"
              onclick={(e) => { handleNavClick(item, e); if (!e.defaultPrevented) mobileOpen = false; }}
              data-sveltekit-preload-data={item.proOnly ? 'off' : undefined}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={16} style={itemIsLocked ? 'opacity:0.5;' : undefined} />
              {#if collapsed && itemIsLocked}
                <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-fg-3" aria-hidden="true"></span>
              {:else if collapsed && item.badge}
                <span
                  class="num absolute -top-0.5 -right-0.5 text-[11px] font-semibold leading-none min-w-4 h-4 px-[3px] rounded-pill inline-flex items-center justify-center {parentActive ? 'bg-acc text-acc-fg' : 'bg-warn-soft text-warn'}"
                  aria-hidden="true"
                >{item.badge > 9 ? '9+' : item.badge}</span>
              {/if}
              {#if !collapsed}
                <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
                {#if itemIsLocked}
                  <Lock size={12} aria-label={t('nav.locked')} class="shrink-0 text-fg-3" />
                {/if}
                {#if item.badge}
                  <span
                    class="num text-[11px] font-semibold min-w-4 h-4 px-[5px] rounded-lg inline-flex items-center justify-center {parentActive ? 'bg-acc text-acc-fg' : 'bg-warn-soft text-warn'}"
                  >{item.badge}</span>
                {/if}
              {/if}
            </a>

            {#if !collapsed && item.sub && parentActive}
              <div class="ml-8 mt-px mb-1 pl-[10px] border-l border-divider flex flex-col">
                {#each item.sub as sub}
                  <a
                    href={periodLink(sub.href)}
                    onclick={() => mobileOpen = false}
                    class="py-[5px] px-[10px] rounded-[5px] no-underline text-[12.5px] {is(sub.href) ? 'text-fg font-medium bg-hover' : 'text-fg-2 font-normal'}"
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
      class="block mx-1 mb-[14px] p-[10px] rounded-lg no-underline border {data.trialExpired ? 'bg-neg-soft border-neg' : 'bg-surface-2 border-divider'}">
      {#if data.trialExpired}
        <div class="text-[11px] font-medium text-neg truncate">{t('sidebar.trialExpiredChip')}</div>
      {:else}
        <div class="text-[11px] truncate {data.quotaLimit ? 'mb-[7px]' : ''}"><span class="font-medium text-fg-2">{t(data.planNameKey)}</span><span class="text-fg-3">&nbsp;·&nbsp;</span><span class="num text-fg-3">{data.quotaUsed}{#if data.quotaLimit}/{data.quotaLimit}{/if}</span><span class="text-fg-3">&nbsp;{#if data.subscriptionStatus === 'canceled'}· {t('billing.canceled')}{:else}{t('shell.quota')}{/if}</span></div>
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
          class="flex items-center gap-2.5 px-[10px] py-[6px] h-[30px] rounded-md text-fg-3 text-[13px] no-underline"
        >
          <Settings size={15} />
          <span>{t('nav.settings')}</span>
        </a>

        <a
          href="/help"
          onclick={() => mobileOpen = false}
          class="flex items-center gap-2.5 px-[10px] py-[6px] h-[30px] rounded-md text-fg-3 text-[13px] no-underline"
        >
          <CircleHelp size={15} />
          <span>{t('nav.help')}</span>
        </a>

        <button
          type="button"
          class="md:hidden flex items-center gap-2.5 px-[10px] py-[6px] h-[30px] rounded-md text-fg-3 text-[13px] bg-transparent border-none cursor-pointer text-left w-full"
          onclick={toggleLocale}
        >
          <Languages size={15} />
          <span>{t('a11y.switchLanguage')}</span>
        </button>

        <button
          type="button"
          class="md:hidden flex items-center gap-2.5 px-[10px] py-[6px] h-[30px] rounded-md text-fg-3 text-[13px] bg-transparent border-none cursor-pointer text-left w-full"
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
        <div class="w-7 h-7 rounded-full shrink-0 bg-acc text-acc-fg text-[11px] font-semibold flex items-center justify-center">
          {userInitials}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[12.5px] font-medium text-fg leading-[1.2] truncate">
            {userName}
          </div>
          <div class="text-[11px] text-fg-3">{data.restaurantName}</div>
        </div>
        <form method="POST" action="/logout" class="shrink-0" onsubmit={handleLogoutSubmit}>
          <button
            type="submit"
            title={t('action.switchAccount')}
            aria-label={t('action.switchAccount')}
            class="w-10 h-10 bg-transparent border-none cursor-pointer text-fg-3 flex items-center justify-center rounded-md"
          >
            <ArrowLeftRight size={13} />
          </button>
        </form>
        <form method="POST" action="/logout" class="shrink-0" onsubmit={handleLogoutSubmit}>
          <button
            type="submit"
            title={t('action.logout')}
            aria-label={t('action.logout')}
            class="w-10 h-10 bg-transparent border-none cursor-pointer text-fg-3 flex items-center justify-center rounded-md"
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
              <span style="flex:1;">{t('a11y.switchTheme')}</span>
            </button>
            <button type="button" class="acct-item" role="menuitem" onclick={toggleLocale}>
              <Languages size={15} />
              <span style="flex:1;">{t('a11y.switchLanguage')}</span>
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
      <div class="shrink-0 px-5 py-[10px] bg-neg-soft border-b border-neg flex items-center gap-3 flex-wrap">
        <span class="flex-1 min-w-[200px] text-[13px] text-neg">{t('billing.trialExpiredMsg')}</span>
        <a href="/billing?upgrade=trial" class="btn btn-primary shrink-0 no-underline" style="height:34px;padding:0 14px;">
          {t('billing.subscribeNow')}
        </a>
      </div>
    {/if}

    {#if data.openBatches?.length > 0 && !is('/batch')}
      <div class="shrink-0 px-5 py-2.5 bg-warn-soft border-b border-warn flex items-center gap-3 flex-wrap">
        <span class="flex-1 min-w-[200px] text-[13px] text-warn">{tp('upload.openBatches.warning', data.openBatches.length)}</span>
        <a href="/batch/{data.openBatches[0]!.batchId}" class="btn btn-primary" style="height:34px;padding:0 14px;text-decoration:none;flex-shrink:0;">
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
        class="fixed inset-0 z-[110] bg-[var(--mep-scrim)] flex items-center justify-center p-6"
        role="presentation"
        onclick={() => completeDismissed = true}
      >
        <div
          class="bg-[var(--mep-overlay)] border border-border-strong rounded-card px-7 py-8 max-w-[360px] w-full shadow-pop text-center"
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
        class="fixed right-5 bottom-5 z-[105] w-[300px] bg-[var(--mep-overlay)] border border-border-strong rounded-card px-4 pt-4 pb-[14px] shadow-pop"
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
            onclick={() => setTutorialStep(tourPages[0]!.step)}
          >
            {t('tour.nudge.accept')}
          </button>
        </div>
      </div>
    {/if}

    {#if upgradeModalOpen}
      <div
        class="fixed inset-0 z-[110] bg-[var(--mep-scrim)] flex items-center justify-center p-6"
        role="presentation"
        onclick={() => upgradeModalOpen = false}
      >
        <div
          class="bg-[var(--mep-overlay)] border border-border-strong rounded-card p-6 max-w-[380px] w-full shadow-pop"
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
            <strong id="upgrade-modal-title" class="flex-1 text-[16px] font-semibold text-fg tracking-[-0.01em]">
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
              <div class="flex items-center gap-2.5 h-[var(--mep-row-h)] px-[10px] rounded-input bg-hover">
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
