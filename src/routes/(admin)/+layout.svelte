<script lang="ts">
  import { page } from '$app/stores';

  const { children, data } = $props();

  const p = $derived($page.url.pathname);
  const navItems = [
    { href: '/admin',         label: 'Overview' },
    { href: '/admin/events',  label: 'Events' },
    { href: '/admin/health',  label: 'Health' },
  ];
</script>

<div style="min-height:100vh;background:var(--mep-bg,#f8f8f8);display:flex;flex-direction:column;">

  <!-- Admin banner -->
  <header style="
    background:#dc2626;color:#fff;
    padding:0 24px;height:52px;
    display:flex;align-items:center;gap:16px;
    flex-shrink:0;
  ">
    <span style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">
      Admin
    </span>
    <span style="width:1px;height:20px;background:#fff3;"></span>
    <nav style="display:flex;gap:2px;">
      {#each navItems as item}
        {@const active = p === item.href || (item.href !== '/admin' && p.startsWith(item.href))}
        <a
          href={item.href}
          style="
            padding:5px 12px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:500;
            background:{active ? 'rgba(255,255,255,0.2)' : 'transparent'};
            color:#fff;
          "
        >{item.label}</a>
      {/each}
    </nav>
    <div style="flex:1;"></div>
    <span style="font-size:12px;opacity:0.7;">{data.adminEmail}</span>
    <a href="/dashboard" style="font-size:12px;color:#fff;opacity:0.75;text-decoration:none;padding:4px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);">
      ← App
    </a>
  </header>

  <!-- Page content -->
  <main style="flex:1;overflow:auto;">
    {@render children()}
  </main>

</div>
