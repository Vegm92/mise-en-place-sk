<script lang="ts">
  import { ChevronRight } from 'lucide-svelte';
  import type { Snippet } from 'svelte';

  let {
    title,
    sub,
    href,
    actionLabel,
    noPad = false,
    children,
    headerRight,
  }: {
    title: string;
    sub?: string;
    href?: string;
    actionLabel?: string;
    noPad?: boolean;
    children?: Snippet;
    headerRight?: Snippet;
  } = $props();
</script>

<div class="card overflow-hidden flex flex-col">
  <div class="card-header">
    <div class="section-title">
      <span class="subtitle">{title}</span>
      {#if sub}<span class="body" style="font-size:12px;">{sub}</span>{/if}
    </div>

    {#if headerRight}
      {@render headerRight()}
    {:else if href && actionLabel}
      <a {href} class="btn btn-ghost" style="height:28px;font-size:12px;text-decoration:none;flex-shrink:0;">
        {actionLabel} <ChevronRight size={12} />
      </a>
    {/if}
  </div>

  <div class={noPad ? '' : 'p-4'}>
    {@render children?.()}
  </div>
</div>
