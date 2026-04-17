<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  const { children } = $props();

  const p = $derived($page.url.pathname);
  const is = (path: string) => p === path || p.startsWith(path + '/');

  let sidebarOpen = $state(false);

  onMount(() => {
    const close = () => sidebarOpen = false;
    document.addEventListener('sveltekit:navigation-start', close);
    return () => document.removeEventListener('sveltekit:navigation-start', close);
  });

  const nav = [
    { href: '/dashboard',       icon: '⊞', label: 'Dashboard',     active: () => is('/dashboard') },
    { href: '/budgets',          icon: '◎', label: 'Budgets',        active: () => is('/budgets') },
    { href: '/',                 icon: '↑', label: 'Upload Invoice', active: () => p === '/' },
    { href: '/invoices',         icon: '▤', label: 'Invoices',       active: () => is('/invoices') && !is('/invoices/export') },
    { href: '/analytics/prices', icon: '↗', label: 'Price Tracking', active: () => is('/analytics/prices') },
    { href: '/analytics/spend',  icon: '◑', label: 'Spend Analysis', active: () => is('/analytics/spend') },
    { href: '/reminders',        icon: '🔔', label: 'Reminders',     active: () => is('/reminders') },
    { href: '/invoices/export',  icon: '↓', label: 'Export CSV',     active: () => is('/invoices/export') },
  ];
  const manage = [
    { href: '/suppliers', icon: '◈', label: 'Suppliers', active: () => is('/suppliers') },
    { href: '/settings',  icon: '⚙', label: 'Settings',  active: () => is('/settings') },
  ];
</script>

<svelte:head>
  <title>{$page.data.title ?? 'Mise en Place'}</title>
</svelte:head>

<!-- Overlay -->
{#if sidebarOpen}
  <div
    class="fixed inset-0 z-[99] bg-black/55 md:hidden"
    onclick={() => sidebarOpen = false}
    role="presentation"
  ></div>
{/if}

<!-- Sidebar -->
<nav
  class="w-[200px] shrink-0 flex flex-col min-h-screen sticky top-0 h-screen overflow-y-auto
         bg-[#1e1e28]
         max-md:fixed max-md:left-0 max-md:top-0 max-md:bottom-0 max-md:z-[100] max-md:w-[220px] max-md:h-full
         max-md:transition-transform max-md:duration-[220ms] max-md:ease-in-out
         {sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}"
>
  <div class="px-5 pt-5 pb-4 border-b border-[#2e2e3a]">
    <div class="text-[.8rem] font-bold tracking-[.08em] uppercase text-[#e8b4a0]">Mise en Place</div>
    <div class="text-[.65rem] text-[#5a5068] mt-[.2rem] tracking-[.04em]">Back Office</div>
  </div>

  <div class="text-[.62rem] font-bold tracking-[.1em] uppercase text-[#3e3850] px-5 pt-4 pb-[.3rem]">Main</div>
  {#each nav as item}
    <a
      href={item.href}
      onclick={() => sidebarOpen = false}
      class="flex items-center gap-[.6rem] px-5 py-2 text-[.8rem] text-[#7a7090] no-underline
             transition-colors duration-100 border-l-2 border-transparent
             hover:bg-[#2a2a38] hover:text-[#e8b4a0]
             {item.active() ? 'bg-[#2a2a38] text-[#e8b4a0] border-l-[#c8847a] font-semibold' : ''}"
    >
      <span class="w-4 text-center shrink-0">{item.icon}</span> {item.label}
    </a>
  {/each}

  <div class="text-[.62rem] font-bold tracking-[.1em] uppercase text-[#3e3850] px-5 pt-4 pb-[.3rem]">Manage</div>
  {#each manage as item}
    <a
      href={item.href}
      onclick={() => sidebarOpen = false}
      class="flex items-center gap-[.6rem] px-5 py-2 text-[.8rem] text-[#7a7090] no-underline
             transition-colors duration-100 border-l-2 border-transparent
             hover:bg-[#2a2a38] hover:text-[#e8b4a0]
             {item.active() ? 'bg-[#2a2a38] text-[#e8b4a0] border-l-[#c8847a] font-semibold' : ''}"
    >
      <span class="w-4 text-center shrink-0">{item.icon}</span> {item.label}
    </a>
  {/each}
</nav>

<!-- Main -->
<div class="flex-1 flex flex-col min-h-screen overflow-x-hidden">
  <div class="bg-[#1e1e28] px-6 py-3 flex items-center justify-between border-b border-[#2e2e3a] shrink-0
              max-md:px-4 max-md:py-[.65rem] max-md:gap-2">
    <button
      class="md:hidden bg-transparent border-none text-[#c8c0d8] cursor-pointer px-[.4rem] py-1 text-[1.3rem] leading-none shrink-0"
      onclick={() => sidebarOpen = !sidebarOpen}
      aria-label="Open menu"
    >☰</button>
    <div>
      <div class="text-[.95rem] font-bold text-[#e8e8f0] max-md:text-[.85rem]">
        {$page.data.title ?? 'Mise en Place'}
      </div>
      {#if $page.data.subtitle}
        <div class="text-[.7rem] text-[#5a5068] mt-[.15rem]">{$page.data.subtitle}</div>
      {/if}
    </div>
    <div class="flex gap-2 items-center">
      {#if $page.data.topbarActions}
        {@html $page.data.topbarActions}
      {/if}
    </div>
  </div>
  <div class="p-6 flex-1 max-md:p-[.85rem]">
    {@render children()}
  </div>
</div>
