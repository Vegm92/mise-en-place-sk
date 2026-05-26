<script lang="ts">
  import Delta from './Delta.svelte';

  let {
    name,
    color,
    spend,
    pct,
    barWidth,
    delta = null,
    formatEur,
  }: {
    name: string;
    color: string;
    spend: number;
    pct: number;
    barWidth: number;
    delta?: number | null;
    formatEur: (n: number) => string;
  } = $props();
</script>

<div class="grid items-center gap-3 py-1.5 border-b border-divider last:border-0"
  style="grid-template-columns:1fr 90px 46px {delta !== null ? '44px' : ''};">
  <div class="min-w-0">
    <div class="flex items-center gap-2 mb-1">
      <span class="swatch" style="background:{color};width:6px;height:6px;border-radius:1px;"></span>
      <span class="body-strong overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
    </div>
    <div class="h-1 rounded-full bg-divider overflow-hidden">
      <div class="h-full rounded-full" style="width:{barWidth}%;background:{color};"></div>
    </div>
  </div>
  <div class="num text-fg text-right" style="font-size:12.5px;">{formatEur(spend)}</div>
  <div class="num text-fg-3 text-right" style="font-size:11.5px;">{pct.toFixed(1).replace('.', ',')}%</div>
  {#if delta !== null}
    <div class="text-right"><Delta value={delta} /></div>
  {/if}
</div>
