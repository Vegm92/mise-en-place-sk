<script lang="ts">
  import { page } from '$app/state';
  import { toggleTheme as flipTheme, currentTheme } from '$lib/theme';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { t, initLocale } from '$lib/i18n';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import Logo from '$lib/components/mep/Logo.svelte';

  const { children, data } = $props();

  let theme = $state<'light' | 'dark'>(
    browser ? currentTheme() : 'light'
  );

  onMount(() => {
    initLocale();
    const storedTheme = localStorage.getItem('mep-theme') as 'light' | 'dark' | null;
    if (storedTheme && storedTheme !== theme) theme = storedTheme;
  });

  function toggleTheme() {
    theme = flipTheme();
  }

  const pageTitle = $derived(
    page.data.title ? t(page.data.title) : t('admin.banner')
  );

  const p = $derived(page.url.pathname);
  const navItems = $derived([
    { href: '/admin',         label: t('admin.overview') },
    { href: '/admin/access',  label: t('admin.access.nav') },
    { href: '/admin/revenue', label: t('admin.revenue') },
    { href: '/admin/feature-flags', label: t('admin.featureFlags.nav') },
    { href: '/admin/events',  label: t('admin.events') },
    { href: '/admin/whatsapp', label: t('admin.whatsapp.nav') },
    { href: '/admin/dead-letters', label: t('admin.dlq.nav') },
    { href: '/admin/errors',  label: t('admin.errors') },
    { href: '/admin/learning', label: t('admin.learning.nav') },
    { href: '/admin/health',  label: t('admin.health') },
  ]);
  const isActive = (href: string) => p === href || (href !== '/admin' && p.startsWith(href));

  const initials = $derived(
    (data.adminEmail || '').split('@')[0]?.slice(0, 2).toUpperCase() || '··'
  );
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="mep" data-accent="tinta" data-density="default"
  style="width:100%;min-height:100vh;display:flex;flex-direction:column;background:var(--mep-bg);border-top:4px solid var(--mep-acc);">

  <header class="px-3 gap-3 md:px-6 md:gap-5" style="
    flex-shrink:0;height:52px;
    display:flex;align-items:center;
    background:var(--mep-surface);
    border-bottom:1px solid var(--mep-divider);
  ">
    <a href="/dashboard" style="
      display:inline-flex;align-items:center;gap:5px;flex-shrink:0;
      font-size:12.5px;color:var(--mep-fg-3);
      text-decoration:none;padding:4px 8px 4px 4px;border-radius:5px;
    ">
      <ChevronLeft size={13} />
      <span class="hidden md:inline">{t('admin.backToApp')}</span>
    </a>

    <div class="hidden md:block" style="width:1px;height:18px;background:var(--mep-divider);"></div>

    <div style="display:flex;align-items:center;gap:10px;">
      <span class="md:hidden"><Logo size={18} /></span>
      <span class="hidden md:inline"><Logo size={18} wordmark /></span>
      <span class="num hidden md:inline-flex" style="
        align-items:center;
        padding:2px 7px;border-radius:4px;
        background:var(--mep-acc);color:var(--mep-acc-fg);
        font-size:11px;font-weight:700;letter-spacing:0.12em;
        line-height:14px;text-transform:uppercase;
      ">
        {t('admin.banner')}
      </span>
    </div>

    <nav class="overflow-x-auto md:overflow-x-visible md:ml-2"
      style="display:flex;align-items:center;gap:2px;flex:1;min-width:0;scrollbar-width:none;">
      {#each navItems as item}
        {@const active = isActive(item.href)}
        <a
          href={item.href}
          style="
            position:relative;padding:6px 12px;font-size:13px;flex-shrink:0;
            font-weight:{active ? 600 : 500};
            color:{active ? 'var(--mep-fg)' : 'var(--mep-fg-2)'};
            text-decoration:none;border-radius:5px;
          "
        >
          <span>{item.label}</span>
          {#if active}
            <span class="hidden md:block" style="position:absolute;left:8px;right:8px;bottom:-15px;height:2px;border-radius:1px;background:var(--mep-acc);"></span>
          {/if}
        </a>
      {/each}
    </nav>

    <button
      class="btn btn-ghost"
      style="width:30px;height:30px;padding:0;justify-content:center;flex-shrink:0;"
      onclick={toggleTheme}
      title={t('a11y.switchTheme')}
    >
      {#if theme === 'dark'}<Sun size={14} />{:else}<Moon size={14} />{/if}
    </button>

    <div class="pl-0 md:pl-3 border-0 md:border-l" style="display:flex;align-items:center;gap:8px;flex-shrink:0;border-color:var(--mep-divider);">
      <div style="
        width:22px;height:22px;border-radius:50%;flex-shrink:0;
        background:var(--mep-acc-soft);color:var(--mep-acc);
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:600;
      ">{initials}</div>
      <div class="num hidden md:block" style="font-size:11.5px;color:var(--mep-fg-2);">
        {data.adminEmail}
      </div>
    </div>
  </header>

  <main style="flex:1;overflow:auto;display:flex;flex-direction:column;">
    {@render children()}
  </main>

</div>
