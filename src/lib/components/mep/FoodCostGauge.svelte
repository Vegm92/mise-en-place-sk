<script lang="ts">
  import { t, ti } from '$lib/i18n';

  let {
    value,
    target,
    max = 60,
  }: {
    value: number | null;
    target: number;
    max?: number;
  } = $props();

  const R = 56;
  const CX = 76;
  const CY = 68;
  const ARC = Math.PI * R;

  const filled = $derived(value === null ? 0 : Math.min(Math.max(value / max, 0), 1));
  const offset = $derived(ARC * (1 - filled));

  const tone = $derived.by(() => {
    if (value === null) return 'var(--mep-fg-4)';
    if (value > target + 5) return 'var(--mep-neg)';
    if (value > target) return 'var(--mep-warn)';
    return 'var(--mep-pos)';
  });

  const tick = $derived.by(() => {
    const angle = Math.PI * (1 - Math.min(Math.max(target / max, 0), 1));
    return {
      x1: CX + Math.cos(angle) * (R - 9),
      y1: CY - Math.sin(angle) * (R - 9),
      x2: CX + Math.cos(angle) * (R + 9),
      y2: CY - Math.sin(angle) * (R + 9),
    };
  });

  const reading = $derived(value === null ? '—' : `${value.toFixed(1)} %`);
</script>

<div class="gauge flex flex-col items-center gap-1">
  <div class="gauge-plot">
    <svg viewBox="0 0 152 78" width="190" height="98" role="img"
      aria-label={value === null ? t('rec.sum.foodCost') : ti('rec.rail.gaugeLabel', { value: reading, target })}>
      <path d="M {CX - R} {CY} A {R} {R} 0 0 1 {CX + R} {CY}" fill="none"
        stroke="var(--mep-divider)" stroke-width="11" stroke-linecap="round" />
      <path d="M {CX - R} {CY} A {R} {R} 0 0 1 {CX + R} {CY}" fill="none"
        stroke={tone} stroke-width="11" stroke-linecap="round"
        stroke-dasharray={ARC} stroke-dashoffset={offset} />
      <line x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2}
        stroke="var(--mep-fg)" stroke-width="2" stroke-linecap="round" />
    </svg>
    <div class="gauge-reading flex flex-col items-center">
      <span class="title-lg num" style="line-height:1;">{reading}</span>
      <span class="label text-fg-3">{t('rec.sum.foodCost')}</span>
    </div>
  </div>
  <span class="body text-fg-3" style="font-size:11px;">{ti('rec.rail.target', { target })}</span>
</div>

<style>
  .gauge-plot { position: relative; display: inline-flex; }
  .gauge-reading {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 6px;
    gap: 2px;
    pointer-events: none;
  }
</style>
