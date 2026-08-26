<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    headerRight,
    children,
  }: {
    title: string;
    headerRight?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div class="card" style="padding:13px 14px 14px;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
    <span class="body-strong">{title}</span>
    {@render headerRight?.()}
  </div>
  {@render children?.()}
</div>
