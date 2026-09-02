<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, sub, children }: { title: string; sub?: string; children?: Snippet } = $props();
</script>

<div class="hud-panel">
  <div class="hud-panel-header">
    <span class="hud-panel-title">{title}</span>
    {#if sub}<span class="hud-panel-sub">{sub}</span>{/if}
  </div>
  {@render children?.()}
</div>

<style>
  .hud-panel {
    background: #0a0c11;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }

  .hud-panel-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    min-width: 0;
  }

  .hud-panel-title {
    font: 600 10px/1 ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #e7edf5;
    white-space: nowrap;
  }

  .hud-panel-sub {
    font: 500 10px/1.3 ui-monospace, monospace;
    color: #5b6472;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
