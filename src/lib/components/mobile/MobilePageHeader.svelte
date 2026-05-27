<script lang="ts">
  import { Search, Bell } from 'lucide-svelte';

  let { title, hasAlert = false }: { title: string; hasAlert?: boolean } = $props();
</script>

<div style="
  padding: 16px 18px 10px;
  display: flex; align-items: center; justify-content: space-between;
">
  <h1 style="margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.4px; color: var(--mep-fg);">
    {title}
  </h1>
  <div style="display: flex; align-items: center; gap: 8px;">
    <button style="
      width: 36px; height: 36px; border-radius: 18px;
      border: 0; background: var(--mep-surface);
      color: var(--mep-fg-2); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    " aria-label="Buscar">
      <Search size={16} />
    </button>
    <a href="/reminders" style="
      width: 36px; height: 36px; border-radius: 18px;
      border: 0; background: var(--mep-surface);
      color: var(--mep-fg-2); cursor: pointer; position: relative;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04); text-decoration: none;
    " aria-label="Alertas">
      <Bell size={16} />
      {#if hasAlert}
        <span style="
          position: absolute; top: 8px; right: 8px;
          width: 6px; height: 6px; border-radius: 3px;
          background: var(--mep-neg);
          border: 1.5px solid var(--mep-surface);
        "></span>
      {/if}
    </a>
  </div>
</div>
