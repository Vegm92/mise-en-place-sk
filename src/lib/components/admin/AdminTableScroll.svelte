<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<div class="admin-table-scroll">
  {@render children?.()}
</div>

<style>
  .admin-table-scroll {
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }
</style>
