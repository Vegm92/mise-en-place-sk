<script lang="ts">
  let {
    value,
    target,
    max,
    color = 'var(--mep-acc)',
    overColor = 'var(--mep-neg)',
    width = 160,
    height = 12,
    label,
  }: {
    value: number;
    target: number;
    max: number;
    color?: string;
    overColor?: string;
    width?: number;
    height?: number;
    label: string;
  } = $props();

  const safeMax = $derived(max > 0 ? max : Math.max(value, target, 1));
  const w = $derived((v: number) => Math.max(0, Math.min(1, v / safeMax)) * width);
  const over = $derived(value > target);
</script>

<svg {width} {height} style="display:block;overflow:visible;" role="img" aria-label={label}>
  <rect x="0" y="0" {width} {height} fill="var(--mep-surface-2)" rx="2" />
  <rect x="0" y="0" width={w(safeMax * 0.7)} {height} fill="var(--mep-hover)" />
  <rect x="0" y={height * 0.25} width={w(Math.min(value, target))} height={height * 0.5} fill={color} rx="1" />
  {#if over}
    <rect x={w(target)} y={height * 0.25} width={w(value) - w(target)} height={height * 0.5} fill={overColor} />
  {/if}
  <line x1={w(target)} x2={w(target)} y1="-1" y2={height + 1} stroke="var(--mep-fg)" stroke-width="2" />
</svg>
