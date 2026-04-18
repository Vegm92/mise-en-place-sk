<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    LayoutDashboard, FileText, Users, TrendingUp, Wallet,
    Bell, Download, Upload, Settings, ChevronRight, Menu
  } from 'lucide-svelte';

  const { children } = $props();

  const p = $derived($page.url.pathname);
  const is = (path: string) => p === path || p.startsWith(path + '/');

  let sidebarOpen = $state(false);

  onMount(() => {
    const close = () => { sidebarOpen = false; };
    document.addEventListener('sveltekit:navigation-start', close);
    return () => document.removeEventListener('sveltekit:navigation-start', close);
  });

  const nav = [
    { href: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard',     active: () => is('/dashboard') },
    { href: '/invoices',        icon: FileText,        label: 'Invoices',       active: () => is('/invoices') && !is('/invoices/export') },
    { href: '/suppliers',       icon: Users,           label: 'Suppliers',      active: () => is('/suppliers') },
    { href: '/analytics/spend', icon: TrendingUp,      label: 'Analytics',      active: () => is('/analytics') },
    { href: '/budgets',         icon: Wallet,          label: 'Budgets',        active: () => is('/budgets') },
    { href: '/reminders',       icon: Bell,            label: 'Reminders',      active: () => is('/reminders') },
    { href: '/invoices/export', icon: Download,        label: 'Export CSV',     active: () => is('/invoices/export') },
    { href: '/settings',        icon: Settings,        label: 'Settings',       active: () => is('/settings') },
  ];
</script>

<svelte:head>
  <title>{$page.data.title ?? 'Mise en Place'}</title>
</svelte:head>

<div class="flex min-h-screen bg-[#F0F2F5]">

  <!-- Mobile overlay -->
  {#if sidebarOpen}
    <div
      class="fixed inset-0 z-[99] bg-black/60 md:hidden"
      onclick={() => sidebarOpen = false}
      role="presentation"
    ></div>
  {/if}

  <!-- Sidebar -->
  <nav
    class="w-[220px] shrink-0 flex flex-col h-screen sticky top-0 bg-[#0A0A0A] overflow-y-auto z-[100]
           max-md:fixed max-md:left-0 max-md:top-0 max-md:bottom-0 max-md:h-full
           max-md:transition-transform max-md:duration-200
           {sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}"
  >
    <!-- Logo -->
    <div class="flex items-center gap-[10px] px-5 h-[60px] border-b border-[#1A1A1A] shrink-0">
      <div class="w-7 h-7 rounded-[7px] bg-[#4A9FD8] flex items-center justify-center shrink-0">
        <span class="text-white text-[11px] font-bold leading-none">M</span>
      </div>
      <span class="text-white text-[14px] font-semibold tracking-[-0.01em]">Mise en Place</span>
    </div>

    <!-- Nav items -->
    <div class="flex flex-col gap-[2px] px-3 pt-4 flex-1">
      {#each nav as item}
        <a
          href={item.href}
          onclick={() => sidebarOpen = false}
          class="flex items-center gap-[10px] px-3 py-[9px] rounded-[8px] text-[13px] font-[500] no-underline
                 transition-colors duration-100
                 {item.active()
                   ? 'bg-[#1A1A1A] text-white'
                   : 'text-[#666666] hover:bg-[#141414] hover:text-[#AAAAAA]'}"
        >
          <svelte:component this={item.icon} size={15} class={item.active() ? 'text-[#4A9FD8]' : 'text-current'} />
          {item.label}
        </a>
      {/each}
    </div>

    <!-- Upload button at bottom -->
    <div class="px-3 pb-5 shrink-0">
      <a
        href="/"
        onclick={() => sidebarOpen = false}
        class="flex items-center justify-center gap-[8px] w-full py-[9px] rounded-[8px]
               bg-[#4A9FD8] text-white text-[13px] font-semibold no-underline
               hover:bg-[#3d8ec7] transition-colors"
      >
        <Upload size={14} />
        Upload Invoice
      </a>
    </div>
  </nav>

  <!-- Main area -->
  <div class="flex-1 flex flex-col min-w-0">

    <!-- Mobile topbar -->
    <div class="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-[#E5E7EB]">
      <button
        class="bg-transparent border-none cursor-pointer p-1 text-[#666666]"
        onclick={() => sidebarOpen = !sidebarOpen}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      <span class="text-[15px] font-semibold text-[#1A1A1A]">{$page.data.title ?? 'Mise en Place'}</span>
    </div>

    <!-- Page content -->
    <div class="flex-1 p-6 max-md:p-4">
      {@render children()}
    </div>

  </div>
</div>
