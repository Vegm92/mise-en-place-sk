<script lang="ts">
  import { computeDonutSlices, donutSeparatorAngleRad, donutSeparatorPoint } from '$lib/donut-math';

  interface Slice { label: string; value: number; color: string }

  let {
    slices,
    total,
    centerLabel = '',
    valueFormatter = (v: number) => String(v),
    size = 180,
    radius = 70,
    strokeWidth = 26,
    hoverStrokeWidth = strokeWidth + 4,
    hovered = $bindable<number | null>(null),
  }: {
    slices: Slice[];
    total?: number;
    centerLabel?: string;
    valueFormatter?: (v: number) => string;
    size?: number;
    radius?: number;
    strokeWidth?: number;
    hoverStrokeWidth?: number;
    hovered?: number | null;
  } = $props();

  const computed = $derived(computeDonutSlices(slices, radius));
  const grandTotal = $derived(total ?? computed.total);
  const circumference = $derived(2 * Math.PI * radius);
  const gap = $derived(computed.slices.length > 1 ? 2 : 0);
  const center = $derived(size / 2);
</script>

<div class="donut-chart" style="position:relative;width:{size}px;height:{size}px;flex-shrink:0;">
  <svg width={size} height={size} viewBox="0 0 {size} {size}" style="overflow:visible;transform:rotate(-90deg);">
    {#each computed.slices as slice, i}
      <circle cx={center} cy={center} r={radius} fill="none"
        stroke={slice.color}
        stroke-width={hovered === i ? hoverStrokeWidth : strokeWidth}
        stroke-dasharray="{Math.max(slice.dash - gap, 0)} {circumference - slice.dash + gap}"
        stroke-dashoffset={-slice.offset}
        opacity={hovered === null || hovered === i ? 1 : 0.35}
        style="cursor:pointer;transition:stroke-width 120ms,opacity 120ms;"
        role="img"
        aria-label="{slice.label}: {valueFormatter(slice.value)} ({Math.round(slice.pct * 100)}%)"
        onmouseenter={() => hovered = i}
        onmouseleave={() => hovered = null} />
    {/each}
    {#if computed.slices.length > 1}
      {#each computed.slices as slice (slice.label)}
        {@const angle = donutSeparatorAngleRad(slice.offset, circumference)}
        {@const inner = donutSeparatorPoint(center, center, radius - strokeWidth / 2 - 1, angle)}
        {@const outer = donutSeparatorPoint(center, center, radius + strokeWidth / 2 + 1, angle)}
        <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
          stroke="var(--mep-surface)" stroke-width="2" stroke-linecap="round" pointer-events="none" />
      {/each}
    {/if}
  </svg>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;">
    {#if hovered !== null && computed.slices[hovered]}
      <span class="num" style="font-size:16px;font-weight:600;color:var(--mep-fg);">{Math.round(computed.slices[hovered].pct * 100)}%</span>
      <span style="font-size:11px;color:var(--mep-fg-3);max-width:{Math.round(size * 0.65)}px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{computed.slices[hovered].label}</span>
    {:else}
      <span class="num" style="font-size:16px;font-weight:600;color:var(--mep-fg);">{valueFormatter(grandTotal)}</span>
      {#if centerLabel}
        <span style="font-size:11px;color:var(--mep-fg-3);">{centerLabel}</span>
      {/if}
    {/if}
  </div>
</div>
