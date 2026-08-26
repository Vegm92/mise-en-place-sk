<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    route,
    title,
    subtitle,
    right,
  }: {
    route: string;
    title: string;
    subtitle?: string;
    right?: Snippet;
  } = $props();
</script>

<div class="px-3 md:px-6" style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding-top:22px;padding-bottom:16px;">
  <div>
    <div class="num" style="font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:var(--mep-fg-3);margin-bottom:4px;">
      {route}
    </div>
    <h1 style="margin:0;font-size:24px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{title}</h1>
    {#if subtitle}
      <div style="font-size:13px;color:var(--mep-fg-2);margin-top:6px;">{subtitle}</div>
    {/if}
  </div>
  {#if right}{@render right()}{/if}
</div>
